import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleX, ExternalLink, LoaderCircle, Plug, X } from "lucide-react";

import {
  cancelConnectorLogin,
  connectConnector,
  getConnectors,
  type ConnectorState,
  type ConnectorStateResponse,
} from "../api.ts";

type ConnectorLibraryProps = {
  onClose: () => void;
};

function ConnectorMark({ connector }: { connector: ConnectorState }) {
  return (
    <span className="connector-mark" aria-hidden="true">
      <span>{connector.name.slice(0, 1)}</span>
      <img
        alt=""
        onError={(event) => { event.currentTarget.hidden = true; }}
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(connector.domain)}&sz=64`}
      />
    </span>
  );
}

export function ConnectorLibrary({ onClose }: ConnectorLibraryProps) {
  const [data, setData] = useState<ConnectorStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getConnectors());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load connections.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const connecting = useMemo(
    () => data?.connectors.some((connector) => connector.status === "connecting") ?? false,
    [data],
  );

  useEffect(() => {
    if (!connecting) return;
    const interval = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(interval);
  }, [connecting, load]);

  async function connect(connector: ConnectorState) {
    setWorkingId(connector.id);
    setError(null);
    try {
      setData(await connectConnector(connector.id));
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not start this connection.");
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  async function cancel(connector: ConnectorState) {
    setWorkingId(connector.id);
    setError(null);
    try {
      setData(await cancelConnectorLogin(connector.id));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not stop this sign-in.");
      await load();
    } finally {
      setWorkingId(null);
    }
  }

  const availableToAgent = data?.connectors.filter((connector) => connector.status === "connected") ?? [];
  const featured = data?.connectors.filter((connector) => connector.status !== "connected") ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="connector-library-title"
        aria-modal="true"
        className="connector-library"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="connector-library__header">
          <div>
            <span className="section-label">Connected sources</span>
            <h2 id="connector-library-title">Bring in where the work already lives.</h2>
            <p>Connect once, then ask the field to retrieve relevant material. Anything placed here becomes a source snapshot you can trace back.</p>
          </div>
          <button aria-label="Close connector library" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <div className="connector-library__context">
          <Plug aria-hidden="true" size={15} />
          <span>Connections are added to {data?.provider === "claude" ? "Claude Code" : "Codex"}. Sign-in opens in your browser.</span>
        </div>

        {error && <p className="connector-library__error">{error}</p>}

        {availableToAgent.length > 0 && (
          <section className="connector-ready" aria-label="Sources already available to the agent">
            <span>Already available to the agent</span>
            <div>
              {availableToAgent.map((connector) => (
                <div key={connector.id}><ConnectorMark connector={connector} /><strong>{connector.name}</strong><Check aria-hidden="true" size={13} /></div>
              ))}
            </div>
          </section>
        )}

        <div className="connector-grid" aria-label="Featured connectors">
          {featured.map((connector) => {
            const isWorking = workingId === connector.id;
            const isWaiting = connector.status === "connecting";
            const connected = connector.status === "connected";
            return (
              <article className="connector-card" key={connector.id}>
                <div className="connector-card__heading">
                  <ConnectorMark connector={connector} />
                  <div><strong>{connector.name}</strong><span>{connector.content}</span></div>
                </div>
                <p>{connector.description}</p>
                {connector.message && <small>{connector.message}</small>}
                <button
                  className={connected ? "is-connected" : ""}
                  disabled={isWorking || connected}
                  onClick={() => void (isWaiting ? cancel(connector) : connect(connector))}
                  type="button"
                >
                  {isWorking ? <LoaderCircle aria-hidden="true" className="connector-spinner" size={14} /> : isWaiting ? <CircleX aria-hidden="true" size={14} /> : connected ? <Check aria-hidden="true" size={14} /> : <ExternalLink aria-hidden="true" size={14} />}
                  {isWorking ? (isWaiting ? "Stopping…" : "Opening browser…") : isWaiting ? "Cancel sign-in" : connected ? "Connected" : connector.status === "configured" ? "Reconnect" : connector.status === "failed" ? "Try again" : "Connect"}
                </button>
              </article>
            );
          })}
          {data && featured.length === 0 && (
            <p className="connector-library__loading">The featured sources are already available to the agent.</p>
          )}
          {!data && !error && <p className="connector-library__loading">Reading your Codex connections…</p>}
        </div>

      </section>
    </div>
  );
}
