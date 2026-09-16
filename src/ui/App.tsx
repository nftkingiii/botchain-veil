import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, ChevronDown, CircleAlert, Copy, Download, ExternalLink, FilePlus2, Fingerprint, Layers2, LoaderCircle, RefreshCw, Search, Shield, Wallet, X } from "lucide-react";
import { formatEther, isAddress, parseEther, type Address, type Hash } from "viem";
import { contractAddress, deploymentBlock, explorerUrl, loadCreatedGrants, loadLifecycleLogs, makeCommitment, makeResolutionHash, makeTermsHash, publicClient, readNetwork, requestSwitchToBotChain, scopedStorageKey, simulateAndWrite, veilAbi, waitForTx, type NetworkRead } from "../chain";

type Tab = "plan" | "grants" | "evidence";
type GrantRow = { commitment: Hash; termsHash: Hash; amount: bigint; deadline: bigint; txHash?: Hash; blockNumber?: bigint; title?: string; deliverable?: string; localOnly?: boolean };
type Notice = { kind: "good" | "warn" | "bad"; text: string } | null;
type FeedItem = { kind: "created" | "funded" | "resolved"; commitment: Hash; txHash: Hash; block: bigint; detail: string; when?: bigint };

const ROUTE_KEY = "veil:plan-route";
const shorten = (value: string, n = 8) => `${value.slice(0, n)}…${value.slice(-5)}`;
const displayError = (error: unknown) => {
  const e = error as { shortMessage?: string; message?: string; code?: number };
  if (e?.code === 4001) return "Wallet request rejected. No transaction was sent.";
  return e?.shortMessage || e?.message?.split("\n")[0] || "Request failed. Check the network and try again.";
};

function getLocalRows(account?: string): GrantRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(account)) || "[]") as GrantRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function DisclosureDiagram({ separate }: { separate: boolean }) {
  const stages = separate
    ? [{ label: "Terms", edges: ["terms hash", "amount", "deadline"] }, { label: "Wait", edges: ["time gap", "no Veil action"] }, { label: "Funding record", edges: ["operator", "amount", "timestamp"] }]
    : [{ label: "Terms", edges: ["terms hash", "amount", "deadline"] }, { label: "Funding record", edges: ["operator", "amount", "timestamp"] }];
  return <div className="diagram" aria-label={separate ? "Separated workflow disclosure diagram" : "Bundled workflow disclosure diagram"}>
    <div className="diagram-track">{stages.map((stage, index) => <div className="diagram-stage" key={stage.label}>
      {index > 0 && <div className="diagram-link" aria-hidden="true"><span /></div>}
      <div className="stage-node"><span className="stage-index">0{index + 1}</span><strong>{stage.label}</strong><div className="stage-edges">{stage.edges.map((edge) => <span key={edge}>{edge}</span>)}</div></div>
    </div>)}</div>
    <div className="diagram-legend"><span><i className="legend-public" /> Visible on-chain</span><span><i className="legend-local" /> Local-only grant details</span><span><i className="legend-not" /> Not enforced by contract</span></div>
  </div>;
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.replace("#", "") as Tab) || "plan");
  const [route, setRoute] = useState<"separate" | "bundled">(() => (localStorage.getItem(ROUTE_KEY) as "separate" | "bundled") || "separate");
  const [network, setNetwork] = useState<NetworkRead | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [operator, setOperator] = useState(false);
  const [rows, setRows] = useState<GrantRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Hash>();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");
  const [title, setTitle] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [exportMenu, setExportMenu] = useState(false);
  const provider = window.ethereum;

  const refresh = useCallback(async () => {
    setLoading(true); setNetworkError("");
    try {
      const [read, created] = await Promise.all([readNetwork(), loadCreatedGrants()]);
      setNetwork(read);
      const local = getLocalRows(account);
      const byCommitment = new Map(local.map((row) => [row.commitment.toLowerCase(), row]));
      const merged = created.map((chainRow) => ({ ...byCommitment.get(chainRow.commitment.toLowerCase()), ...chainRow, title: byCommitment.get(chainRow.commitment.toLowerCase())?.title, deliverable: byCommitment.get(chainRow.commitment.toLowerCase())?.deliverable }));
      setRows(merged);
      const [funded, resolved] = await Promise.all([loadLifecycleLogs("funded").catch(() => []), loadLifecycleLogs("resolved").catch(() => [])]);
      const items: FeedItem[] = created.map((x) => ({ kind: "created", commitment: x.commitment, txHash: x.txHash!, block: x.blockNumber!, detail: `${formatEther(x.amount)} BOT declared · deadline ${new Date(Number(x.deadline) * 1000).toLocaleDateString()}` }));
      for (const log of funded) items.push({ kind: "funded", commitment: log.args.commitment as Hash, txHash: log.transactionHash!, block: log.blockNumber!, detail: `${formatEther(log.args.amount as bigint)} BOT marked funded` });
      for (const log of resolved) items.push({ kind: "resolved", commitment: log.args.commitment as Hash, txHash: log.transactionHash!, block: log.blockNumber!, detail: `Resolution hash ${shorten(log.args.resolutionHash as string)} · ${log.args.recovered ? "recovery marked" : "resolution marked"}` });
      setFeed(items.sort((a, b) => Number(b.block - a.block)));
    } catch (error) { setNetworkError(displayError(error)); }
    finally { setLoading(false); }
  }, [account]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { localStorage.setItem(ROUTE_KEY, route); }, [route]);
  useEffect(() => { location.hash = tab; }, [tab]);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (next: unknown) => { const addr = (next as string[])[0]; setAccount(addr && isAddress(addr) ? addr as Address : undefined); setNotice(null); };
    const onChain = (next: unknown) => { setWalletChain(Number.parseInt(String(next), 16)); setNotice(null); };
    provider.on("accountsChanged", onAccounts); provider.on("chainChanged", onChain);
    return () => { provider.removeListener?.("accountsChanged", onAccounts); provider.removeListener?.("chainChanged", onChain); };
  }, [provider]);

  useEffect(() => {
    let live = true;
    if (!account || !network) { setOperator(false); return; }
    publicClient.readContract({ address: contractAddress, abi: veilAbi, functionName: "operator" })
      .then((owner) => { if (live) setOperator(owner.toLowerCase() === account.toLowerCase()); })
      .catch(() => { if (live) setOperator(false); });
    return () => { live = false; };
  }, [account, network]);

  const selectedRow = rows.find((row) => row.commitment === selected) ?? rows[0];
  const visibleRows = useMemo(() => rows.filter((row) => {
    const matches = `${row.title || ""} ${row.commitment} ${row.termsHash}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "all" || filter === (row.title ? "local" : "onchain"));
  }), [rows, query, filter]);

  async function connect() {
    if (!provider) { setNotice({ kind: "bad", text: "No injected EVM wallet found. Install a wallet such as MetaMask to write; public reads remain available." }); return; }
    try {
      setBusy("connect");
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const chain = await provider.request({ method: "eth_chainId" }) as string;
      if (accounts[0] && isAddress(accounts[0])) setAccount(accounts[0] as Address);
      setWalletChain(Number.parseInt(chain, 16));
      setNotice({ kind: "good", text: "Wallet connected. Veil has not requested a transaction." });
    } catch (error) { setNotice({ kind: "bad", text: displayError(error) }); }
    finally { setBusy(""); }
  }

  async function switchChain() {
    if (!provider) return;
    try { setBusy("switch"); await requestSwitchToBotChain(provider); const id = await provider.request({ method: "eth_chainId" }) as string; setWalletChain(Number.parseInt(id, 16)); setNotice({ kind: "good", text: "Wallet is now on BOT Chain Testnet." }); }
    catch (error) { setNotice({ kind: "bad", text: displayError(error) }); }
    finally { setBusy(""); }
  }

  async function sendAction(action: "create" | "funded" | "resolve") {
    if (!provider || !account) { setNotice({ kind: "bad", text: "Connect the authorized operator wallet first." }); return; }
    if (walletChain !== 968) { setNotice({ kind: "warn", text: "Switch the wallet to BOT Chain Testnet before reviewing this transaction." }); return; }
    if (!operator) { setNotice({ kind: "bad", text: "Connected wallet is not the contract operator. This contract grants no alternate writer role." }); return; }
    try {
      setBusy(action); setNotice({ kind: "warn", text: "Simulating the selected contract call. Review the wallet confirmation before signing." });
      let method: "createGrant" | "markFunded" | "resolve";
      let args: readonly unknown[];
      let commitment: Hash | undefined;
      let local: GrantRow | undefined;
      if (action === "create") {
        if (!title.trim() || !deliverable.trim() || !amount || !deadline) throw new Error("Complete each grant field before preparing the on-chain record.");
        const qty = parseEther(amount);
        const expiry = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
        if (qty <= 0n || expiry <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Enter a positive declared amount and a future deadline.");
        commitment = makeCommitment();
        const termsHash = makeTermsHash(title.trim(), deliverable.trim(), qty, expiry);
        method = "createGrant"; args = [commitment, termsHash, qty, expiry];
        local = { commitment, termsHash, amount: qty, deadline: expiry, title: title.trim(), deliverable: deliverable.trim() };
      } else if (action === "funded") {
        if (!selectedRow) throw new Error("Select an on-chain grant first.");
        if (!window.confirm("This writes a public 'marked funded' status only. It does not transfer or lock BOT. Continue to the wallet review?")) return;
        commitment = selectedRow.commitment; method = "markFunded"; args = [commitment];
      } else {
        if (!selectedRow || evidenceRef.trim().length < 8) throw new Error("Select a grant and enter a non-sensitive evidence reference (at least 8 characters).");
        if (!window.confirm("This records a resolution hash only. It does not verify work or release funds. Continue to the wallet review?")) return;
        commitment = selectedRow.commitment; method = "resolve"; args = [commitment, makeResolutionHash(evidenceRef), false];
      }
      const hash = await simulateAndWrite(provider, account, method, args);
      setNotice({ kind: "warn", text: `Transaction submitted ${shorten(hash)}. Waiting for a receipt…` });
      const receipt = await waitForTx(hash);
      if (receipt.status !== "success") throw new Error(`Transaction ${shorten(hash)} reverted. No state change confirmed.`);
      if (local && commitment) {
        const stored = getLocalRows(account);
        localStorage.setItem(scopedStorageKey(account), JSON.stringify([{ ...local, txHash: hash, localOnly: false }, ...stored.filter((x) => x.commitment !== commitment)]));
        setTitle(""); setDeliverable(""); setAmount(""); setDeadline("");
      }
      setNotice({ kind: "good", text: `Confirmed on BOT Chain Testnet at block ${receipt.blockNumber}. Veil records evidence; it does not move funds.` });
      await refresh();
    } catch (error) { setNotice({ kind: "bad", text: displayError(error) }); }
    finally { setBusy(""); }
  }

  function exportGrants() {
    const blob = new Blob([JSON.stringify(visibleRows.map((r) => ({ ...r, amount: r.amount.toString(), deadline: r.deadline.toString(), localOnly: true })), null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = href; a.download = "veil-grant-index.json"; a.click(); URL.revokeObjectURL(href); setExportMenu(false);
  }

  async function copy(value: string) { await navigator.clipboard.writeText(value); setNotice({ kind: "good", text: "Copied to clipboard. Hashes are public identifiers, not proof of the underlying work." }); }

  const wrongWalletChain = Boolean(account && walletChain !== 968);
  return <div className="shell">
    <aside className="rail">
      <a className="brand" href="#plan" aria-label="Veil home"><img src="/veil-mark.svg" alt="" /><span>veil</span></a>
      <nav className="side-nav" aria-label="Main workflows">
        {([["plan", "Plan", Layers2], ["grants", "Grants", FilePlus2], ["evidence", "Evidence", Activity]] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <div className="rail-foot"><span className="network-dot" /><div><strong>BOT Chain Testnet</strong><small>Chain 968 · BOT</small></div><a className="icon-button" href={`${explorerUrl}/address/${contractAddress}`} target="_blank" rel="noreferrer" aria-label="Open contract explorer" title="Open contract explorer"><ExternalLink size={16} /></a></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="mobile-brand"><img src="/veil-mark.svg" alt="" /> veil</div><div className="top-status"><span className={networkError ? "status-dot down" : "status-dot"} />{networkError ? "Read unavailable" : loading ? "Checking network…" : `Block ${network?.blockNumber.toLocaleString()}`}</div><div className="top-actions">
        {account ? <><span className="wallet-address" title={account}>{shorten(account)}</span><span className={`role-pill ${operator ? "is-operator" : ""}`}>{operator ? "Operator" : "Read only"}</span><button className="icon-button" onClick={() => { setAccount(undefined); setWalletChain(undefined); setOperator(false); }} title="Disconnect in Veil" aria-label="Disconnect wallet in Veil"><X size={16} /></button></> : <button className="connect" onClick={() => void connect()} disabled={busy === "connect"}><Wallet size={16} /> Connect wallet</button>}
        {wrongWalletChain && <button className="switch-chain" onClick={() => void switchChain()} disabled={busy === "switch"}>{busy === "switch" ? "Switching…" : "Switch network"}</button>}
      </div></header>

      <div className="content">
        {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.kind === "good" ? <Check size={17} /> : <CircleAlert size={17} />}</span><p>{notice.text}</p><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
        {networkError && <div className="read-error"><CircleAlert size={18} /><div><strong>Public reads did not load</strong><span>{networkError}</span></div><button onClick={() => void refresh()}><RefreshCw size={15} /> Retry</button></div>}

        {tab === "plan" && <>
          <div className="page-heading"><div><h1>See the links before you record them.</h1><p>Compare what the public chain can connect across a grant’s lifecycle.</p></div><a className="contract-link" href={`${explorerUrl}/address/${contractAddress}`} target="_blank" rel="noreferrer">Verified testnet contract <ExternalLink size={15} /></a></div>
          <section className="route-section" aria-label="Route comparison">
            <div className="route-column"><button className={`route-choice ${route === "separate" ? "selected" : ""}`} onClick={() => setRoute("separate")} aria-pressed={route === "separate"}><span className="radio" /><span><strong>Separate the steps</strong><small>Leave time between the grant record and the funding attestation.</small></span><span className="route-tag">Less direct timing link</span></button><DisclosureDiagram separate /></div>
            <div className="route-column"><button className={`route-choice ${route === "bundled" ? "selected" : ""}`} onClick={() => setRoute("bundled")} aria-pressed={route === "bundled"}><span className="radio" /><span><strong>Keep steps together</strong><small>Record terms and funding attestation in the same work session.</small></span><span className="route-tag caution">Closer timing link</span></button><DisclosureDiagram separate={false} /></div>
          </section>
          <div className="boundary-note"><Shield size={17} /><p><strong>What the contract actually does.</strong> It writes a terms hash, declared BOT amount and deadline; an operator can separately mark the grant funded and attach a resolution hash. It does not transfer BOT, validate a payout, adjudicate delivery, or make anyone anonymous. An anchor proves a hash was recorded—not that the grant happened as described.</p></div>

          <section className="prepare-section">
            <div className="section-title"><div><span className="section-number">01</span><h2>Prepare a grant record</h2></div><span className="local-label">Details stay in this browser</span></div>
            <form className="grant-form" onSubmit={(e) => { e.preventDefault(); void sendAction("create"); }}>
              <label>Grant name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Community translation sprint" required /></label>
              <label>Deliverable<input value={deliverable} onChange={(e) => setDeliverable(e.target.value)} maxLength={240} placeholder="What outcome will be reviewed?" required /></label>
              <label>Declared amount<div className="input-suffix"><input type="number" min="0.000001" step="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /><span>BOT</span></div><small>For the public record only. No tokens are transferred by Veil.</small></label>
              <label>Deadline<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required /></label>
              <button className="primary-action" disabled={!operator || wrongWalletChain || Boolean(busy)} type="submit">{busy === "create" ? <LoaderCircle className="spin" size={17} /> : <FilePlus2 size={17} />} Record terms <span>Wallet confirmation required</span></button>
            </form>
            {!account && <p className="form-hint">Public reads work without a wallet. Connect the configured operator account to write.</p>}
            {account && !operator && <p className="form-hint warning">Connected account is not the contract operator. The deployed contract allows only its operator to write.</p>}
            <p className="contract-footnote">Generated terms hash is encoded from the exact form fields. Avoid putting personal or confidential data in either field; hashes can be guessed when inputs are predictable.</p>
          </section>
        </>}

        {tab === "grants" && <>
          <div className="page-heading grants-heading"><div><h1>Grant records</h1><p>On-chain records paired with optional browser-local descriptions.</p></div><div className="heading-actions"><button className="subtle-action" onClick={() => void refresh()} title="Refresh records"><RefreshCw size={16} /> Refresh</button><div className="export-wrap"><button className="subtle-action" onClick={() => setExportMenu(!exportMenu)} title="Export records"><Download size={16} /> Export <ChevronDown size={14} /></button>{exportMenu && <div className="export-menu"><button onClick={exportGrants}>Export visible JSON</button></div>}</div></div></div>
          <div className="filterbar"><label className="searchbox"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search grant, commitment or terms hash" aria-label="Search grant records" /></label><label className="filter-select"><span>Show</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All records</option><option value="onchain">On-chain</option><option value="local">Local details</option></select></label><span className="result-count">{visibleRows.length} records</span></div>
          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22} /><strong>Reading grant events</strong><span>Checking the deployed Veil contract from its deployment block.</span></div> : visibleRows.length === 0 ? <div className="empty-state"><Fingerprint size={25} /><strong>{query ? "No matching records" : "No grants recorded yet"}</strong><span>{query ? "Try another title or hash." : "Prepare a grant on Plan. Contract events are public; descriptive fields are browser-local."}</span><button onClick={() => setTab("plan")}>Prepare a record</button></div> : <div className="records-layout"><div className="record-list" role="list">{visibleRows.map((row) => <button key={row.commitment} className={`record-row ${selectedRow?.commitment === row.commitment ? "active" : ""}`} onClick={() => setSelected(row.commitment)} role="listitem"><span className="record-marker"><Fingerprint size={16} /></span><span className="record-main"><strong>{row.title || "Grant record"}</strong><small className="mono">{shorten(row.commitment, 12)}</small></span><span className="record-amount">{formatEther(row.amount)}<small>BOT declared</small></span></button>)}</div>
            {selectedRow && <article className="record-detail"><div className="detail-top"><div><span className="eyebrow-label">GRANT RECORD</span><h2>{selectedRow.title || "Description not on this device"}</h2></div><span className="chain-badge">On-chain</span></div><p className="detail-desc">{selectedRow.deliverable || "This description is not in browser-local storage for the connected account. The public chain stores its terms hash, not the original wording."}</p><dl className="detail-fields"><div><dt>Terms hash</dt><dd className="mono" title={selectedRow.termsHash}>{shorten(selectedRow.termsHash, 14)}<button onClick={() => void copy(selectedRow.termsHash)} aria-label="Copy terms hash"><Copy size={14} /></button></dd></div><div><dt>Grant commitment</dt><dd className="mono" title={selectedRow.commitment}>{shorten(selectedRow.commitment, 14)}<button onClick={() => void copy(selectedRow.commitment)} aria-label="Copy commitment"><Copy size={14} /></button></dd></div><div><dt>Declared amount</dt><dd>{formatEther(selectedRow.amount)} BOT <span className="subtext">not a transfer</span></dd></div><div><dt>Deadline</dt><dd>{new Date(Number(selectedRow.deadline) * 1000).toLocaleString()}</dd></div></dl><div className="detail-actions"><button onClick={() => void sendAction("funded")} disabled={!operator || Boolean(busy)} title="Marks status only; does not transfer funds">Mark funded <ArrowUpRight size={15} /></button><label className="evidence-input">Resolution reference<input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} maxLength={120} placeholder="Public URL or evidence ID" /></label><button onClick={() => void sendAction("resolve")} disabled={!operator || Boolean(busy)} title="Records a hash only; does not verify or pay">Record resolution <Check size={15} /></button></div><p className="detail-caveat">The operator controls these state changes. Veil does not verify the underlying funding or work. Keep references non-sensitive; the resolution hash is public.</p><a href={`${explorerUrl}/address/${contractAddress}`} target="_blank" rel="noreferrer" className="explorer-action">Open contract on explorer <ExternalLink size={14} /></a></article>}</div>}
        </>}

        {tab === "evidence" && <>
          <div className="page-heading"><div><h1>Evidence, not inference.</h1><p>Contract events show what the operator recorded. They do not establish truth beyond the transaction.</p></div><button className="subtle-action" onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button></div>
          <div className="evidence-context"><div><span>Contract</span><a href={`${explorerUrl}/address/${contractAddress}`} target="_blank" rel="noreferrer" className="mono">{shorten(contractAddress, 13)} <ExternalLink size={13} /></a></div><div><span>Operator</span><strong className="mono">{network ? shorten(network.operator, 13) : "Unavailable"}</strong></div><div><span>Network read</span><strong>{network ? `BOT Chain Testnet · block ${network.blockNumber.toLocaleString()}` : "Unavailable"}</strong></div><div><span>Bytecode</span><strong>{network ? `${network.codeBytes.toLocaleString()} bytes` : "Not verified"}</strong></div></div>
          <div className="feed-head"><h2>Grant lifecycle</h2><span>{feed.length} public events</span></div>
          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22} /><strong>Reading events</strong><span>Loading lifecycle logs from contract deployment block {deploymentBlock.toString()}.</span></div> : feed.length === 0 ? <div className="empty-state"><Activity size={24} /><strong>No lifecycle events yet</strong><span>When this contract records grants, their events will appear here.</span></div> : <ol className="event-feed">{feed.map((event, index) => <li key={`${event.txHash}-${event.kind}-${index}`}><span className={`event-icon ${event.kind}`}>{event.kind === "created" ? <FilePlus2 size={16} /> : event.kind === "funded" ? <ArrowUpRight size={16} /> : <Check size={16} />}</span><div className="event-copy"><strong>{event.kind === "created" ? "Terms recorded" : event.kind === "funded" ? "Marked funded" : "Resolution recorded"}</strong><span>{event.detail}</span><a className="mono" href={`${explorerUrl}/tx/${event.txHash}`} target="_blank" rel="noreferrer">{shorten(event.commitment, 13)} · block {event.block?.toString()} <ExternalLink size={12} /></a></div><a className="event-tx" href={`${explorerUrl}/tx/${event.txHash}`} target="_blank" rel="noreferrer" title="Open transaction"><ExternalLink size={16} /></a></li>)}</ol>}
          <div className="boundary-note evidence-boundary"><Shield size={17} /><p><strong>Attestation boundary.</strong> <code>markFunded</code> and <code>resolve</code> are operator-written status records. No external oracle, prover, payment rail, delivery verifier, or recipient identity layer is integrated. This interface cannot certify that funds moved or work was completed.</p></div>
        </>}

        <footer className="app-footer"><span>Veil · BOT Chain Testnet</span><span>Receipt primitive only · no escrow or anonymity system</span><a href="https://github.com/nftkingiii/botchain-veil" target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a></footer>
      </div>
    </main>
  </div>;
}
