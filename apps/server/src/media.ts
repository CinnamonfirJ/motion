import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  EgressClient,
  EncodingOptionsPreset,
  RoomServiceClient,
  SegmentedFileOutput,
  SegmentedFileProtocol,
} from "livekit-server-sdk";
import type { Moment, Stream } from "@ennoia/core";
import { env, livekitConfigured } from "./env.js";
import { roomNameForStream } from "./livekit.js";

const segmentDurationSec = 2;

function configured(): boolean {
  return Boolean(
    livekitConfigured() && env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_PUBLIC_BASE_URL
  );
}

export function permanentMediaConfigured(): boolean {
  return configured();
}

function s3Client(): S3Client {
  return new S3Client({
    endpoint: env.R2_ENDPOINT,
    region: env.R2_REGION !== "auto" ? env.R2_REGION : env.LIVEKIT_EGRESS_REGION || "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // R2 rejects the AWS SDK v3 default flexible checksums; keep them off for compatibility.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function egressClient(): EgressClient {
  return new EgressClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

function roomClient(): RoomServiceClient {
  return new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

function liveKitTimestampMs(timestamp: bigint, fallback: number): number {
  if (timestamp <= 0n) return fallback;
  if (timestamp >= 100_000_000_000_000_000n) return Number(timestamp / 1_000_000n); // nanoseconds
  if (timestamp >= 100_000_000_000_000n) return Number(timestamp / 1_000n); // microseconds
  if (timestamp >= 100_000_000_000n) return Number(timestamp); // milliseconds
  return Number(timestamp * 1_000n); // seconds
}

export async function startStreamRecording(streamId: string): Promise<{ egressId: string; prefix: string; startedAt: number }> {
  if (!configured()) throw new Error("permanent-media-not-configured");
  const room = roomNameForStream(streamId);
  await roomClient().createRoom({ name: room, emptyTimeout: 10 * 60, departureTimeout: 5 * 60, maxParticipants: 500 });

  const prefix = `streams/${streamId}`;
  const output = new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix: `${prefix}/segment`,
    playlistName: `${prefix}/archive.m3u8`,
    livePlaylistName: `${prefix}/live.m3u8`,
    segmentDuration: segmentDurationSec,
    output: {
      case: "s3",
      value: {
        accessKey: env.R2_ACCESS_KEY_ID,
        secret: env.R2_SECRET_ACCESS_KEY,
        region: env.R2_REGION !== "auto" ? env.R2_REGION : env.LIVEKIT_EGRESS_REGION || "auto",
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_BUCKET,
        forcePathStyle: true,
      },
    },
  });
  const requestedAt = Date.now();
  const info = await egressClient().startRoomCompositeEgress(room, { segments: output }, {
    layout: "speaker",
    encodingOptions: EncodingOptionsPreset.H264_720P_30,
  });
  if (!info.egressId) throw new Error("livekit-egress-did-not-return-an-id");
  return { egressId: info.egressId, prefix, startedAt: liveKitTimestampMs(info.startedAt, requestedAt) };
}

export async function stopStreamRecording(egressId: string | null): Promise<void> {
  if (!egressId || !livekitConfigured()) return;
  await egressClient().stopEgress(egressId);
}

interface HlsSegment {
  duration: number;
  uri: string;
  start: number;
  end: number;
}

function parseSegments(playlist: string): HlsSegment[] {
  const lines = playlist.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: HlsSegment[] = [];
  let elapsed = 0;
  let duration: number | null = null;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      duration = Number(line.slice(8).split(",", 1)[0]);
    } else if (!line.startsWith("#") && duration != null && Number.isFinite(duration)) {
      result.push({ duration, uri: line, start: elapsed, end: elapsed + duration });
      elapsed += duration;
      duration = null;
    }
  }
  return result;
}

async function objectText(key: string): Promise<string> {
  const response = await s3Client().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  if (!response.Body) throw new Error(`r2-object-empty:${key}`);
  return response.Body.transformToString();
}

function publicObjectUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Build a permanent HLS manifest referencing the immutable Egress segments in R2. */
export async function buildPermanentMomentClip(
  moment: Moment,
  stream: Stream,
  recordingPrefix: string,
  recordingStartedAt: number
): Promise<string> {
  if (!configured()) throw new Error("permanent-media-not-configured");
  const sourceKey = `${recordingPrefix}/archive.m3u8`;
  const playlist = await objectText(sourceKey);
  const segments = parseSegments(playlist);
  const recordingOffsetSec = Math.max(0, recordingStartedAt - stream.startedAt) / 1000;
  const wantedStart = Math.max(0, moment.clip.startStreamTimeMs / 1000 - recordingOffsetSec);
  const wantedEnd = moment.clip.endStreamTimeMs / 1000 - recordingOffsetSec;
  if (wantedEnd <= 0) throw new Error("clip-before-recording-started");
  const selected = segments.filter((segment) => segment.end > wantedStart && segment.start < wantedEnd);
  if (!selected.length || selected[selected.length - 1]!.end + 0.1 < wantedEnd) throw new Error("clip-not-ready");

  const sourceBase = publicObjectUrl(sourceKey);
  const targetDuration = Math.max(...selected.map((segment) => Math.ceil(segment.duration)));
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    ...selected.flatMap((segment) => [
      `#EXTINF:${segment.duration.toFixed(3)},`,
      new URL(segment.uri, sourceBase).toString(),
    ]),
    "#EXT-X-ENDLIST",
    "",
  ].join("\n");
  const clipKey = `moments/${moment.id}/index.m3u8`;
  await s3Client().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: clipKey,
    Body: body,
    ContentType: "application/vnd.apple.mpegurl",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicObjectUrl(clipKey);
}
