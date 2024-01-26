const { network, ethers, getNamedAccounts, deployments } = require("hardhat")
const { parseUnits } = require("ethers")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()
require("hardhat-deploy")

const VRF_SUB_FUND_AMOUNT = parseUnits("30", "ether")

module.exports = async function () {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId, VRFCoordinatorV2Mock

    if (developmentChains.includes(network.name)) {
        const VRFCoordinatorV2MockAtAddress = (await deployments.get("VRFCoordinatorV2Mock"))
            .address
        VRFCoordinatorV2Mock = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            VRFCoordinatorV2MockAtAddress,
        )

        vrfCoordinatorV2Address = VRFCoordinatorV2Mock.target
        const transactionResponse = await VRFCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.logs[0].args.subId
        await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    console.log("vrfCoordinatorV2Address = " + vrfCoordinatorV2Address)
    console.log("entranceFee = " + entranceFee)
    console.log("gasLane = " + gasLane)
    console.log("subscriptionId = " + subscriptionId)
    console.log("callbackGasLimit = " + callbackGasLimit)
    console.log("interval = " + interval)
    console.log("deployer = " + deployer)
    console.log("network.name = " + network.name)

    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmation || 1,
    })

    console.log("raffle.address = " + raffle.address)
    console.log("raffle.target = " + raffle.target)

    if (developmentChains.includes(network.name)) {
        const VRFCoordinatorV2MockAtAddress = (await deployments.get("VRFCoordinatorV2Mock"))
            .address
        const VRFCoordinatorV2Mock = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            VRFCoordinatorV2MockAtAddress,
        )
        await VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying ...")
        await verify(raffle.address, args)
    }
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
