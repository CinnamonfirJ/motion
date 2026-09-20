import { expect } from "chai";
import { ethers } from "hardhat";
import { MomentRewards } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const id = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("MomentRewards", () => {
  let contract: MomentRewards;
  let owner: HardhatEthersSigner;
  let backend: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let c1: HardhatEthersSigner, c2: HardhatEthersSigner, stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, backend, creator, c1, c2, stranger] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MomentRewards");
    contract = (await F.deploy()) as unknown as MomentRewards;
    await contract.waitForDeployment();
    await contract.setSettler(backend.address, true);
    await contract.fund({ value: ethers.parseEther("10") });
  });

  it("commits a reaction batch and rejects duplicates", async () => {
    const batchId = id("batch-1");
    await expect(
      contract.connect(backend).commitReactionBatch(batchId, id("stream-1"), 42, 1000, 2000, id("root"))
    ).to.emit(contract, "ReactionBatchCommitted");
    expect(await contract.batchCommitted(batchId)).to.equal(true);
    await expect(
      contract.connect(backend).commitReactionBatch(batchId, id("stream-1"), 42, 1000, 2000, id("root"))
    ).to.be.revertedWithCustomError(contract, "BatchAlreadyCommitted");
  });

  it("settles a Moment, paying creator + curators exactly", async () => {
    const momentId = id("moment-1");
    const creatorAmount = ethers.parseEther("0.7");
    const amounts = [ethers.parseEther("0.18"), ethers.parseEther("0.12")];

    const before = {
      creator: await ethers.provider.getBalance(creator.address),
      c1: await ethers.provider.getBalance(c1.address),
      c2: await ethers.provider.getBalance(c2.address),
    };

    await expect(
      contract.connect(backend).settleMoment(momentId, creator.address, creatorAmount, [c1.address, c2.address], amounts)
    )
      .to.emit(contract, "MomentSettled")
      .withArgs(momentId, creator.address, creatorAmount, ethers.parseEther("0.30"), 2n, ethers.parseEther("1.0"));

    expect(await ethers.provider.getBalance(creator.address)).to.equal(before.creator + creatorAmount);
    expect(await ethers.provider.getBalance(c1.address)).to.equal(before.c1 + amounts[0]);
    expect(await ethers.provider.getBalance(c2.address)).to.equal(before.c2 + amounts[1]);
    expect(await contract.isMomentSettled(momentId)).to.equal(true);
    expect(await contract.totalSettledMoments()).to.equal(1n);
  });

  it("is idempotent: the same Moment cannot settle twice", async () => {
    const momentId = id("moment-dup");
    await contract.connect(backend).settleMoment(momentId, creator.address, ethers.parseEther("1"), [], []);
    await expect(
      contract.connect(backend).settleMoment(momentId, creator.address, ethers.parseEther("1"), [], [])
    ).to.be.revertedWithCustomError(contract, "AlreadySettled");
    expect(await contract.totalSettledMoments()).to.equal(1n);
  });

  it("rejects non-settlers", async () => {
    await expect(
      contract.connect(stranger).settleMoment(id("m"), creator.address, 1n, [], [])
    ).to.be.revertedWithCustomError(contract, "NotSettler");
  });

  it("reverts when the pool cannot cover the payout", async () => {
    await expect(
      contract.connect(backend).settleMoment(id("m2"), creator.address, ethers.parseEther("100"), [], [])
    ).to.be.revertedWithCustomError(contract, "InsufficientPool");
  });

  it("rejects mismatched curator/amount lengths", async () => {
    await expect(
      contract.connect(backend).settleMoment(id("m3"), creator.address, 0n, [c1.address], [])
    ).to.be.revertedWithCustomError(contract, "LengthMismatch");
  });
});
