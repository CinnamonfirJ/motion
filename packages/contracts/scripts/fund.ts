import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { resolve } from "path";

/** Top up the reward pool of an already-deployed MomentRewards. Env: FUND_AMOUNT_ETHER. */
async function main() {
  const file = resolve(__dirname, `../deployments/${network.name}.json`);
  const { address } = JSON.parse(readFileSync(file, "utf8"));
  const amount = process.env.FUND_AMOUNT_ETHER ?? "0.5";
  const contract = await ethers.getContractAt("MomentRewards", address);
  const tx = await contract.fund({ value: ethers.parseEther(amount) });
  await tx.wait();
  console.log(`Funded ${address} with ${amount} MON on ${network.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
