import { createPublicClient, defineChain, http, keccak256, stringToHex, encodeAbiParameters, parseAbi, type Address, type Hash } from "viem";

export const botChainTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_BOTCHAIN_RPC_URL || "https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOT Chain Explorer", url: import.meta.env.VITE_BOTCHAIN_EXPLORER_URL || "https://scan.bohr.life" } },
});

export const contractAddress = (import.meta.env.VITE_VEIL_CONTRACT_ADDRESS || "0xc89fB278716B1B09869e3A466b964578F76b07E") as Address;
export const explorerUrl = (import.meta.env.VITE_BOTCHAIN_EXPLORER_URL || "https://scan.bohr.life").replace(/\/$/, "");
export const deploymentBlock = 0x16801e2n;

export const veilAbi = parseAbi([
  "function operator() view returns (address)",
  "function grants(bytes32) view returns (bytes32 termsHash,uint256 amount,uint64 deadline,bool funded,bool resolved)",
  "function createGrant(bytes32 commitment,bytes32 termsHash,uint256 amount,uint64 deadline)",
  "function markFunded(bytes32 commitment)",
  "function resolve(bytes32 commitment,bytes32 resolutionHash,bool recovered)",
  "event GrantCreated(bytes32 indexed commitment,bytes32 indexed termsHash,uint256 amount,uint64 deadline)",
  "event GrantFunded(bytes32 indexed commitment,uint256 amount)",
  "event GrantResolved(bytes32 indexed commitment,bytes32 indexed resolutionHash,bool recovered)",
]);

export const publicClient = createPublicClient({ chain: botChainTestnet, transport: http(undefined, { timeout: 12_000, retryCount: 1 }) });

export type NetworkRead = { chainId: number; blockNumber: bigint; codeBytes: number; operator: Address };
export async function readNetwork(): Promise<NetworkRead> {
  const [chainId, blockNumber, code, operator] = await Promise.all([
    publicClient.getChainId(), publicClient.getBlockNumber(), publicClient.getBytecode({ address: contractAddress }),
    publicClient.readContract({ address: contractAddress, abi: veilAbi, functionName: "operator" }),
  ]);
  if (chainId !== 968) throw new Error(`RPC chain mismatch: received ${chainId}, expected BOT Chain Testnet 968.`);
  if (!code || code === "0x") throw new Error("No contract bytecode was returned for the configured Veil address.");
  return { chainId, blockNumber, codeBytes: (code.length - 2) / 2, operator };
}

export async function loadCreatedGrants() {
  const logs = await getLogsInWindows(veilAbi[5] as never);
  return logs.map((log) => ({
    commitment: log.args.commitment as Hash,
    termsHash: log.args.termsHash as Hash,
    amount: log.args.amount as bigint,
    deadline: log.args.deadline as bigint,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
  })).reverse();
}

export async function loadLifecycleLogs(event: "funded" | "resolved") {
  const abiEvent = (event === "funded" ? veilAbi[6] : veilAbi[7]) as never;
  return getLogsInWindows(abiEvent);
}

async function getLogsInWindows(event: never) {
  const latest = await publicClient.getBlockNumber();
  const windowSize = 20_000n;
  const windows: Array<Promise<unknown[]>> = [];
  for (let from = deploymentBlock; from <= latest; from += windowSize) {
    const to = from + windowSize - 1n < latest ? from + windowSize - 1n : latest;
    windows.push(publicClient.getLogs({ address: contractAddress, event, fromBlock: from, toBlock: to }) as Promise<unknown[]>);
  }
  return (await Promise.all(windows)).flat() as Array<{ args: Record<string, unknown>; transactionHash: Hash; blockNumber: bigint }>;
}

export function makeCommitment() {
  return keccak256(stringToHex(crypto.randomUUID() + ":" + [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("")));
}

export function makeTermsHash(title: string, deliverable: string, amount: bigint, deadline: bigint) {
  const encoded = encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "uint64" }],
    [title, deliverable, amount, deadline],
  );
  return keccak256(encoded);
}

export function makeResolutionHash(evidenceReference: string) {
  return keccak256(encodeAbiParameters([{ type: "string" }], [evidenceReference.trim()]));
}

export function scopedStorageKey(account?: string) {
  return `veil:968:${contractAddress.toLowerCase()}:${account?.toLowerCase() || "public"}`;
}

export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
declare global { interface Window { ethereum?: InjectedProvider } }

export async function requestSwitchToBotChain(provider: InjectedProvider) {
  const chainId = `0x${botChainTestnet.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId, chainName: botChainTestnet.name,
      nativeCurrency: botChainTestnet.nativeCurrency,
      rpcUrls: [botChainTestnet.rpcUrls.default.http[0]],
      blockExplorerUrls: [botChainTestnet.blockExplorers.default.url],
    }] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}

export async function simulateAndWrite(
  provider: InjectedProvider, account: Address, functionName: "createGrant" | "markFunded" | "resolve", args: readonly unknown[],
): Promise<Hash> {
  const { createWalletClient, custom } = await import("viem");
  const wallet = createWalletClient({ account, chain: botChainTestnet, transport: custom(provider as never) });
  const request = await publicClient.simulateContract({ account, address: contractAddress, abi: veilAbi, functionName, args } as never);
  const signedRequest = { ...request.request, account };
  return wallet.writeContract(signedRequest as never);
}

export async function waitForTx(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
}
