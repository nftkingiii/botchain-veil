// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ScriptBase} from "./ScriptBase.sol";
import {VeilGrantProof} from "../src/VeilGrantProof.sol";

/// @dev Deliberately unsigned by default. Broadcast requires an explicit human action.
contract DeployVeilGrantProof is ScriptBase {
    function run() external returns (VeilGrantProof deployed) {
        address operator = vm.envAddress("VEIL_OPERATOR");
        require(operator != address(0), "VEIL_OPERATOR is zero");
        vm.startBroadcast();
        deployed = new VeilGrantProof(operator);
        vm.stopBroadcast();
    }
}
