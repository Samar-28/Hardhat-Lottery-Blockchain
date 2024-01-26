const { network } = require("hardhat")
const { ethers, parseUnits } = require("ethers")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")

const BASE_FEE = parseUnits("0.25", "ether")
const GAS_PRICE_LINK = 1e9

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(network.name)) {
        log("Local Network detected! Deploying Mocks ...")

        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks deployed")
        log("----------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
