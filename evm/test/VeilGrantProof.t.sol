// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./TestBase.sol";
import {VeilGrantProof} from "../src/VeilGrantProof.sol";

contract VeilGrantProofTest is TestBase {
    VeilGrantProof proof;
    address operator = makeAddr("operator");
    address stranger = makeAddr("stranger");
    bytes32 commitment = keccak256("recipient-secret-commitment");
    bytes32 terms = keccak256("public-grant-terms");

    function setUp() public {
        proof = new VeilGrantProof(operator);
    }

    function testCreatesAndResolvesWithoutRecipientAddress() public {
        vm.prank(operator);
        proof.createGrant(commitment, terms, 1 ether, uint64(block.timestamp + 1 days));
        vm.prank(operator);
        proof.markFunded(commitment);
        vm.prank(operator);
        proof.resolve(commitment, keccak256("resolution"), false);
        (,,, bool funded, bool resolved) = proof.grants(commitment);
        assertTrue(funded);
        assertTrue(resolved);
    }

    function testRejectsNonOperator() public {
        vm.prank(stranger);
        vm.expectRevert(VeilGrantProof.Unauthorized.selector);
        proof.createGrant(commitment, terms, 1 ether, uint64(block.timestamp + 1 days));
    }

    function testRecoveryRequiresDeadline() public {
        vm.startPrank(operator);
        proof.createGrant(commitment, terms, 1 ether, uint64(block.timestamp + 1 days));
        proof.markFunded(commitment);
        vm.expectRevert(VeilGrantProof.NotMature.selector);
        proof.resolve(commitment, keccak256("recovery"), true);
        vm.stopPrank();
    }
}
