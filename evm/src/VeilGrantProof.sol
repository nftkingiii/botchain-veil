// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Public grant terms and lifecycle proof without storing a recipient address.
contract VeilGrantProof {
    error ZeroAddress();
    error InvalidCommitment();
    error InvalidTerms();
    error Unauthorized();
    error AlreadyFunded();
    error UnknownGrant();
    error NotMature();
    error AlreadyResolved();

    struct Grant {
        bytes32 termsHash;
        uint256 amount;
        uint64 deadline;
        bool funded;
        bool resolved;
    }

    address public immutable operator;
    mapping(bytes32 commitment => Grant grant) public grants;

    event GrantCreated(bytes32 indexed commitment, bytes32 indexed termsHash, uint256 amount, uint64 deadline);
    event GrantFunded(bytes32 indexed commitment, uint256 amount);
    event GrantResolved(bytes32 indexed commitment, bytes32 indexed resolutionHash, bool recovered);

    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
    }

    function createGrant(bytes32 commitment, bytes32 termsHash, uint256 amount, uint64 deadline) external {
        if (msg.sender != operator) revert Unauthorized();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (termsHash == bytes32(0) || amount == 0 || deadline <= block.timestamp) revert InvalidTerms();
        if (grants[commitment].termsHash != bytes32(0)) revert AlreadyFunded();
        grants[commitment] = Grant(termsHash, amount, deadline, false, false);
        emit GrantCreated(commitment, termsHash, amount, deadline);
    }

    function markFunded(bytes32 commitment) external {
        if (msg.sender != operator) revert Unauthorized();
        Grant storage grant = grants[commitment];
        if (grant.termsHash == bytes32(0)) revert UnknownGrant();
        if (grant.funded) revert AlreadyFunded();
        grant.funded = true;
        emit GrantFunded(commitment, grant.amount);
    }

    function resolve(bytes32 commitment, bytes32 resolutionHash, bool recovered) external {
        if (msg.sender != operator) revert Unauthorized();
        Grant storage grant = grants[commitment];
        if (grant.termsHash == bytes32(0)) revert UnknownGrant();
        if (!grant.funded || grant.resolved || resolutionHash == bytes32(0)) revert AlreadyResolved();
        if (recovered && block.timestamp < grant.deadline) revert NotMature();
        grant.resolved = true;
        emit GrantResolved(commitment, resolutionHash, recovered);
    }
}
