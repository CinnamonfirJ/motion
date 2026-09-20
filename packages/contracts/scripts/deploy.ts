import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

/**
 * Deploy MomentRewards and (optionally) fund the reward pool.
 * Env:
 *   FUND_AMOUNT_ETHER   initial pool funding in MON (default "0.5")
 *   SETTLER_ADDRESS     extra settler to authorize (the backend signer, if different)
 * Writes the address + ABI to deployments/<network>.json for the backend to consume.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying MomentRewards to ${network.name} as ${deployer.address}`);

  const factory = await ethers.getContractFactory("MomentRewards");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`MomentRewards deployed at ${address}`);

  const settler = process.env.SETTLER_ADDRESS;
  if (settler && settler.toLowerCase() !== deployer.address.toLowerCase()) {
    const tx = await contract.setSettler(settler, true);
    await tx.wait();
    console.log(`Authorized settler ${settler}`);
  }

  const fundEther = process.env.FUND_AMOUNT_ETHER ?? "0.5";
  if (Number(fundEther) > 0) {
    const tx = await contract.fund({ value: ethers.parseEther(fundEther) });
    await tx.wait();
    console.log(`Funded pool with ${fundEther} MON`);
  }

  const artifact = await ethers.getContractFactory("MomentRewards");
  const out = {
    network: network.name,
    address,
    deployer: deployer.address,
    abi: JSON.parse(artifact.interface.formatJson()),
    deployedAt: new Date().toISOString(),
  };
  const dir = resolve(__dirname, "../deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
