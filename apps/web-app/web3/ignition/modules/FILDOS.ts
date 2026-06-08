// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FILDOSModule = buildModule("FILDOSModule", (m) => {
  
  const usdfcAddresses: { [key: string]: string } = {

    "mainnet": "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045",
    "calibration": "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0",
  };

  const usdfcAddress = m.getParameter("usdfcAddress", usdfcAddresses["calibration"]);

  const fildos = m.contract("FolderNFT", [usdfcAddress]);

  return { fildos };
});

export default FILDOSModule;

