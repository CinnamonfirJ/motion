import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Authorize a backend settler on the already-deployed MomentRewards. Must be run with the
 * CONTRACT OWNER's key as DEPLOYER_PRIVATE_KEY.
 * Env:
 *   SETTLER_ADDRESS     address to authorize (required)
 *   TRANSFER_OWNERSHIP  "true" to also make SETTLER_ADDRESS the owner (optional)
 */
async function main() {
  const settler = process.env.SETTLER_ADDRESS;
  if (!settler || !ethers.isAddress(settler)) throw new Error("Set SETTLER_ADDRESS to a valid address");

  const file = resolve(__dirname, `../deployments/${network.name}.json`);
  const { address } = JSON.parse(readFileSync(file, "utf8"));
  const [signer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("MomentRewards", address, signer);

  const owner: string = await contract.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the owner (${owner}) of ${address}`);
  }

  if (await contract.settlers(settler)) {
    console.log(`${settler} is already a settler on ${address}`);
  } else {
    const tx = await contract.setSettler(settler, true);
    await tx.wait();
    console.log(`Authorized settler ${settler} on ${address} (tx ${tx.hash})`);
  }

  if (process.env.TRANSFER_OWNERSHIP === "true") {
    const tx = await contract.transferOwnership(settler);
    await tx.wait();
    console.log(`Transferred ownership to ${settler} (tx ${tx.hash})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
