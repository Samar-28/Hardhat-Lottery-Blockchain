const { assert, expect } = require("chai")
require("@nomicfoundation/hardhat-chai-matchers")
const { network, deployments, ethers, waffle } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { toBigInt } = require("ethers")
const { parseUnits, BigNumber, formatEther } = require("ethers")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleContract, vrfCoordinatorV2Mock, raffleEntranceFee, interval, player // , deployer

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["mocks", "raffle"]) // Deploys modules with the tags "mocks" and "raffle"
              const VRFCoordinatorV2MockAtAddress = (await deployments.get("VRFCoordinatorV2Mock"))
                  .address
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  VRFCoordinatorV2MockAtAddress,
              )
              raffleContract = await ethers.getContract("Raffle")
              raffle = raffleContract.connect(player)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async () => {
                  const raffleState = (await raffle.getRaffleState()).toString()
                  assert.equal(raffleState, "0")
                  assert.equal(
                      interval.toString(),
                      networkConfig[network.config.chainId]["keepersUpdateInterval"],
                  )
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })
              it("records player when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const contractPlayer = await raffle.getPlayer(0)
                  assert.equal(player.address, contractPlayer)
              })
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 5])
                  await network.provider.send("evm_mine", [])
                  const zeroBytes = new Uint8Array()
                  await raffle.performUpkeep(zeroBytes)
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [Number(interval) + 5])
                  await network.provider.send("evm_mine", [])
                  const zeroBytes = new Uint8Array()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(zeroBytes)
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 3])
                  await network.provider.send("evm_mine", [])
                  const zeroBytes = new Uint8Array()
                  await raffle.performUpkeep(zeroBytes)
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(zeroBytes)
                  assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 5])
                  await network.provider.send("evm_mine", [])
                  const zeroBytes = new Uint8Array()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(zeroBytes)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const zeroBytes = new Uint8Array()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(zeroBytes)
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle_UpKeepNotNeeded",
                  )
              })
              it("updates the raffle state and emits a requestId", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const raffleState = await raffle.getRaffleState()
                  const requestId = txReceipt.logs[1].args.requestId
                  assert(Number(requestId) > 0)
                  assert(raffleState == 1)
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 2])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performupkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 2
                  let startingBalance, gasCost
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 2; i < 5; i=i+1
                      raffle = raffleContract.connect(accounts[i])
                      if (i == 2) {
                          const transactionResponse = await raffle.enterRaffle({
                              value: raffleEntranceFee,
                          })
                          const transactionReceipt = await transactionResponse.wait(1)
                          const { gasUsed, gasPrice, fee } = transactionReceipt
                          gasCost = formatEther(fee) 
                          console.log("gasCost = " + gasCost)
                          console.log("gasUsed = " + gasUsed)
                          console.log("gasPrice = " + gasPrice)
                          console.log("fee = " + fee)
                      } else {
                          await raffle.enterRaffle({ value: raffleEntranceFee })
                      }
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  // This will be more important for our staging tests...
                  await new Promise(async (resolve, reject) => {
                      setTimeout(resolve, 5000)
                      raffle.on("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log("Recent winner:" + recentWinner.toString())
                              const raffleState = await raffle.getRaffleState()
                              const provider = ethers.getDefaultProvider()
                              const winnerBalance = await provider.getBalance(accounts[2].address)
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              
                              console.log("Account 2: " + accounts[2].address)
                              assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(raffleState, 0)

                              const ETHValueOfraffleEntranceFee = formatEther(raffleEntranceFee)
                              console.log(
                                  "ETHValueOfraffleEntranceFee = " + ETHValueOfraffleEntranceFee,
                              )
                              const balance1 = Number(winnerBalance)
                              const balance2 =
                                  Number(startingBalance) +
                                  ETHValueOfraffleEntranceFee * Number(additionalEntrances) +
                                  ETHValueOfraffleEntranceFee
                              console.log("Winner balance = " + balance1)
                              console.log("startingBalance = " + startingBalance)
                              console.log("additionalEntrances = " + additionalEntrances)
                              console.log("Balance 2 = " + balance2)
                              assert.equal(balance1, balance2)
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                     
                      try {
                          const tx = await raffle.performUpkeep(new Uint8Array())
                          const txReceipt = await tx.wait(1)
                          const provider = ethers.getDefaultProvider()
                          startingBalance = await provider.getBalance(accounts[2].address)
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              txReceipt.logs[1].args.requestId,
                              raffle.target,
                          )
                      } catch (e) {
                          reject(e)
                      }
                  })
              })
          })
      })
