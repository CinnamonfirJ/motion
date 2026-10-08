import { test } from "node:test";
import assert from "node:assert/strict";
import type { Settlement } from "@ennoia/core";
import { ethers } from "ethers";
import { settlementView } from "./view.js";

function settlement(txHash: string | null, simulated?: boolean): Settlement {
  return {
    momentId: "moment_test",
    status: "confirmed",
    txHash,
    simulated,
    creatorAmountUnits: 1n,
    curatorPoolUnits: 1n,
    totalUnits: 2n,
    submittedAt: 1,
    confirmedAt: 2,
    error: null,
  };
}

test("settlement receipt never presents legacy simulation hashes as on-chain transactions", () => {
  const legacySimulationHash = ethers.keccak256(ethers.toUtf8Bytes("sim:moment_test"));
  const receipt = settlementView(settlement(legacySimulationHash));
  assert.equal(receipt?.onchain, false);
  assert.equal(receipt?.txHash, null);
  assert.equal(receipt?.explorerUrl, null);
});

test("settlement receipt links real transaction hashes to MonadScan, MonadVision, and Monad Explorer", () => {
  const txHash = `0x${"ab".repeat(32)}`;
  const receipt = settlementView(settlement(txHash, false));
  assert.equal(receipt?.onchain, true);
  assert.equal(receipt?.txHash, txHash);
  assert.equal(receipt?.explorerUrl, `https://testnet.monadexplorer.com/tx/${txHash}`);
  assert.equal(receipt?.monadScanUrl, `https://testnet.monadscan.com/tx/${txHash}`);
  assert.equal(receipt?.monadVisionUrl, `https://testnet.monadvision.com/tx/${txHash}`);
});
