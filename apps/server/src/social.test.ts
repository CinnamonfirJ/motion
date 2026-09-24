import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify from "fastify";

test("social feed and live-room permissions use the same authenticated identities", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "ennoia-social-test-"));
  process.env.APP_MODE = "test";
  process.env.DATABASE_URL = "";
  process.env.DB_PATH = join(temporary, "test.sqlite");
  process.env.PRIVY_APP_ID = "";
  process.env.LIVEKIT_URL = "";
  process.env.R2_ENDPOINT = "https://r2.example.test";
  process.env.R2_ACCESS_KEY_ID = "test-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET = "test-bucket";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  process.env.ENABLE_SEED = "false";
  process.env.ENABLE_DEMO_ROUTES = "false";
  const { db, migrateDatabase } = await import("./db.js");
  const { registerRoutes } = await import("./routes.js");
  const app = Fastify();
  try {
    await migrateDatabase();
    await registerRoutes(app);
    await app.ready();
    async function login(email: string) {
      const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email } });
      assert.equal(response.statusCode, 200, response.body);
      return response.json() as { token: string; user: { id: string } };
    }
    const host = await login("host@example.test");
    const viewer = await login("viewer@example.test");
    const hostAuth = { authorization: `Bearer ${host.token}` };
    const viewerAuth = { authorization: `Bearer ${viewer.token}` };

    const community = await app.inject({ method: "POST", url: "/communities", headers: hostAuth, payload: { name: "Builders", description: "Building together" } });
    assert.equal(community.statusCode, 201, community.body);
    const communityId = community.json().community.id as string;
    const deniedPost = await app.inject({ method: "POST", url: "/posts", headers: viewerAuth, payload: { text: "Hello", communityId } });
    assert.equal(deniedPost.statusCode, 403);
    assert.equal((await app.inject({ method: "PUT", url: `/communities/${communityId}/join`, headers: viewerAuth })).statusCode, 200);

    const created = await app.inject({ method: "POST", url: "/posts", headers: viewerAuth, payload: { text: "Hello ENNOIA", communityId } });
    assert.equal(created.statusCode, 201, created.body);
    const postId = created.json().post.id as string;
    const upload = await app.inject({ method: "POST", url: "/media/post-upload", headers: viewerAuth, payload: { contentType: "image/jpeg", sizeBytes: 1000 } });
    assert.equal(upload.statusCode, 200, upload.body);
    assert.match(upload.json().uploadUrl, /^https:\/\/r2\.example\.test\//);
    assert.equal((await app.inject({ method: "PUT", url: `/posts/${postId}/like`, headers: hostAuth })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: `/posts/${postId}/view`, headers: hostAuth })).statusCode, 200);
    const post = await app.inject({ method: "GET", url: `/posts/${postId}`, headers: hostAuth });
    assert.equal(post.json().post.likes, 1);
    assert.equal(post.json().post.views, 1);
    const reply = await app.inject({ method: "POST", url: "/posts", headers: hostAuth, payload: { text: "Welcome!", replyToId: postId } });
    assert.equal(reply.statusCode, 201, reply.body);
    assert.equal((await app.inject({ method: "GET", url: `/posts/${postId}/replies`, headers: hostAuth })).json().posts.length, 1);
    assert.equal((await app.inject({ method: "PUT", url: `/users/${viewer.user.id}/follow`, headers: hostAuth })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/users/${viewer.user.id}/social`, headers: hostAuth })).json().followedByMe, true);
    const publicProfile = await app.inject({ method: "GET", url: `/users/${viewer.user.id}`, headers: hostAuth });
    assert.equal(publicProfile.statusCode, 200, publicProfile.body);
    assert.equal(publicProfile.json().user.id, viewer.user.id);
    assert.equal((await app.inject({ method: "GET", url: `/users/${viewer.user.id}/posts`, headers: hostAuth })).json().posts.length, 1);
    assert.equal((await app.inject({ method: "GET", url: `/communities/${communityId}`, headers: viewerAuth })).json().community.member, true);
    const following = await app.inject({ method: "GET", url: "/feed?mode=following", headers: hostAuth });
    assert.equal(following.statusCode, 200, following.body);
    assert.ok(following.json().items.some((item: { post?: { id: string } }) => item.post?.id === postId));
    const forYou = await app.inject({ method: "GET", url: "/feed?mode=for-you" });
    assert.equal(forYou.statusCode, 200, forYou.body);
    assert.ok(forYou.json().items.some((item: { post?: { id: string } }) => item.post?.id === postId));
    const communityFeed = await app.inject({ method: "GET", url: `/feed?mode=for-you&communityId=${communityId}` });
    assert.equal(communityFeed.statusCode, 200, communityFeed.body);
    assert.ok(communityFeed.json().items.some((item: { post?: { id: string } }) => item.post?.id === postId));

    const stream = await app.inject({ method: "POST", url: "/streams", headers: hostAuth, payload: { title: "Building live" } });
    assert.equal(stream.statusCode, 200, stream.body);
    const streamId = stream.json().stream.id as string;
    assert.equal((await app.inject({ method: "POST", url: `/streams/${streamId}/speaker-request`, headers: viewerAuth })).statusCode, 200);
    const repeatedRequest = await app.inject({ method: "POST", url: `/streams/${streamId}/speaker-request`, headers: viewerAuth });
    assert.equal(repeatedRequest.statusCode, 200, repeatedRequest.body);
    assert.equal(repeatedRequest.json().status, "requested");
    assert.equal((await app.inject({ method: "POST", url: `/streams/${streamId}/speakers/${viewer.user.id}/approve`, headers: viewerAuth })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: `/streams/${streamId}/speakers/${viewer.user.id}/approve`, headers: hostAuth })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/streams/${streamId}/live-room`, headers: viewerAuth })).json().role, "speaker");
    const approvedRequest = await app.inject({ method: "POST", url: `/streams/${streamId}/speaker-request`, headers: viewerAuth });
    assert.equal(approvedRequest.statusCode, 200, approvedRequest.body);
    assert.equal(approvedRequest.json().status, "approved");
    assert.equal((await app.inject({ method: "PATCH", url: `/streams/${streamId}/speakers/${viewer.user.id}`, headers: hostAuth, payload: { canCamera: true } })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/streams/${streamId}/live-room`, headers: viewerAuth })).json().mySpeaker.canCamera, true);
    assert.equal((await app.inject({ method: "DELETE", url: `/streams/${streamId}/speakers/${viewer.user.id}`, headers: hostAuth })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/streams/${streamId}/live-room`, headers: viewerAuth })).json().role, "viewer");
    assert.equal((await app.inject({ method: "POST", url: `/streams/${streamId}/speakers/${viewer.user.id}/invite`, headers: hostAuth })).statusCode, 200);
    const invitedRequest = await app.inject({ method: "POST", url: `/streams/${streamId}/speaker-request`, headers: viewerAuth });
    assert.equal(invitedRequest.statusCode, 200, invitedRequest.body);
    assert.equal(invitedRequest.json().status, "invited");
    assert.equal((await app.inject({ method: "POST", url: `/streams/${streamId}/speaker-invite/accept`, headers: viewerAuth })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: `/streams/${streamId}/live-room`, headers: viewerAuth })).json().role, "speaker");
  } finally {
    await app.close();
    await db.close();
    if (resolve(temporary).startsWith(resolve(tmpdir(), "ennoia-social-test-"))) rmSync(temporary, { recursive: true, force: true });
  }
});
