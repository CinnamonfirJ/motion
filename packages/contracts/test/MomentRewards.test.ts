import { expect } from "chai";
import { ethers } from "hardhat";
import { MomentRewards } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const id = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
const E = (n: string) => ethers.parseEther(n);

describe("MomentRewards", () => {
  let contract: MomentRewards;
  let owner: HardhatEthersSigner;
  let backend: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let c1: HardhatEthersSigner, c2: HardhatEthersSigner, stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, backend, creator, platform, c1, c2, stranger] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MomentRewards");
    contract = (await F.deploy()) as unknown as MomentRewards;
    await contract.waitForDeployment();
    await contract.setSettler(backend.address, true);
    await contract.fund({ value: E("10") });
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

  it("accepts tips into the reward pool and tracks per-stream totals", async () => {
    const streamId = id("stream-tips");
    await expect(contract.connect(stranger).tip(streamId, { value: E("0.5") }))
      .to.emit(contract, "Tipped")
      .withArgs(streamId, stranger.address, E("0.5"), E("0.5"));
    await contract.connect(c1).tip(streamId, { value: E("0.25") });
    expect(await contract.streamTips(streamId)).to.equal(E("0.75"));
    expect(await contract.totalTips()).to.equal(E("0.75"));
    await expect(contract.connect(c1).tip(streamId, { value: 0 })).to.be.revertedWithCustomError(contract, "ZeroAmount");
  });

  it("creates a Moment, recording Founding Curators on-chain; rejects duplicates", async () => {
    const momentId = id("moment-create");
    await expect(
      contract.connect(backend).createMoment(momentId, id("s"), creator.address, 100, 135, 1, [c1.address, c2.address])
    )
      .to.emit(contract, "MomentCreated")
      .withArgs(momentId, id("s"), creator.address, 100, 135, 1, 2n);
    expect(await contract.momentCreated(momentId)).to.equal(true);
    expect(await contract.momentCreatorOf(momentId)).to.equal(creator.address);
    await expect(
      contract.connect(backend).createMoment(momentId, id("s"), creator.address, 100, 135, 1, [c1.address])
    ).to.be.revertedWithCustomError(contract, "AlreadyCreated");
  });

  it("settles a Moment three ways (creator / curators / platform) exactly", async () => {
    const momentId = id("moment-1");
    const creatorAmount = E("0.7");
    const platformAmount = E("0.1");
    const amounts = [E("0.12"), E("0.08")]; // curator pool 0.20

    const before = {
      creator: await ethers.provider.getBalance(creator.address),
      platform: await ethers.provider.getBalance(platform.address),
      c1: await ethers.provider.getBalance(c1.address),
      c2: await ethers.provider.getBalance(c2.address),
    };

    await expect(
      contract
        .connect(backend)
        .settleMoment(momentId, creator.address, creatorAmount, platform.address, platformAmount, [c1.address, c2.address], amounts)
    )
      .to.emit(contract, "MomentSettled")
      .withArgs(momentId, creator.address, creatorAmount, E("0.20"), platformAmount, 2n, E("1.0"));

    expect(await ethers.provider.getBalance(creator.address)).to.equal(before.creator + creatorAmount);
    expect(await ethers.provider.getBalance(platform.address)).to.equal(before.platform + platformAmount);
    expect(await ethers.provider.getBalance(c1.address)).to.equal(before.c1 + amounts[0]);
    expect(await ethers.provider.getBalance(c2.address)).to.equal(before.c2 + amounts[1]);
    expect(await contract.isMomentSettled(momentId)).to.equal(true);
    expect(await contract.totalSettledMoments()).to.equal(1n);
  });

  it("is idempotent: the same Moment cannot settle twice", async () => {
    const momentId = id("moment-dup");
    await contract.connect(backend).settleMoment(momentId, creator.address, E("0.9"), platform.address, E("0.1"), [], []);
    await expect(
      contract.connect(backend).settleMoment(momentId, creator.address, E("0.9"), platform.address, E("0.1"), [], [])
    ).to.be.revertedWithCustomError(contract, "AlreadySettled");
    expect(await contract.totalSettledMoments()).to.equal(1n);
  });

  it("rejects non-settlers", async () => {
    await expect(
      contract.connect(stranger).settleMoment(id("m"), creator.address, 1n, platform.address, 0n, [], [])
    ).to.be.revertedWithCustomError(contract, "NotSettler");
  });

  it("reverts when the pool cannot cover the payout", async () => {
    await expect(
      contract.connect(backend).settleMoment(id("m2"), creator.address, E("100"), platform.address, 0n, [], [])
    ).to.be.revertedWithCustomError(contract, "InsufficientPool");
  });

  it("rejects mismatched curator/amount lengths", async () => {
    await expect(
      contract.connect(backend).settleMoment(id("m3"), creator.address, 0n, platform.address, 0n, [c1.address], [])
    ).to.be.revertedWithCustomError(contract, "LengthMismatch");
  });
});
