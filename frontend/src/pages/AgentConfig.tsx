import { FlaskConical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { BehaviorPanel } from '../components/agent/BehaviorPanel';
import { AgentSwitcher, DeployModal, PresetsMenu } from '../components/agent/ControlMenus';
import { PerformancePanel, SimulationConsole } from '../components/agent/InsightPanels';
import { Button, Empty, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { attempt, useLive } from '../store/live';
import type { AgentConfig } from '../types';

/** Agent Configuration ("Control Room"): tune, evaluate and deploy an AI agent through a governed draft. */
export default function AgentConfigPage() {
  const { agentId } = useParams();
  const liveVersion = useLive((s) => (agentId ? s.versions.agents[agentId] ?? 0 : 0));
  const { data, error, reload } = useAsync(() => (agentId ? api.agent(agentId) : Promise.reject(new Error('no agent'))), [agentId, liveVersion]);
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [evalsRunning, setEvalsRunning] = useState(false);
  const [failures, setFailures] = useState<{ id: string; prompt: string; score: number; improve: string[] }[] | null>(null);
  const [evalsOnDraft, setEvalsOnDraft] = useState(false);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt server state unless the supervisor has unsaved edits in flight.
  useEffect(() => {
    if (data && !dirty.current) setCfg(data.draft?.config ?? data.agent.config);
  }, [data]);
  useEffect(() => { dirty.current = false; setFailures(null); setEvalsOnDraft(false); }, [agentId]);
  useEffect(() => { if (!data?.draft) setEvalsOnDraft(false); }, [data?.draft]);

  if (!agentId) return <Navigate to="/agents/csr-returns" replace />;
  if (error && !data) return <Empty title="Agent not found" body={error.message} />;
  if (!data || !cfg) return <div className="flex h-[60vh] items-center justify-center"><Spinner /></div>;

  const change = (next: AgentConfig) => {
    setCfg(next);
    dirty.current = true;
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await attempt(() => api.saveDraft(agentId, next));
      dirty.current = false;
      setSaving(false);
      setEvalsOnDraft(false);
      reload();
    }, 450);
  };

  const runEvals = async () => {
    setEvalsRunning(true);
    const target = data.draft ? 'draft' : 'deployed';
    const res = await attempt(() => api.runEvals(agentId, target));
    setEvalsRunning(false);
    if (res) {
      setFailures(res.failures);
      if (target === 'draft') setEvalsOnDraft(true);
      const avg = Math.round(res.suite.reduce((n, s) => n + s.score, 0) / res.suite.length);
      useLive.getState().toast({ tone: res.failures.length ? 'info' : 'success', title: `Evaluations finished: ${avg}% average`, body: res.failures.length ? `${res.failures.length} scenario(s) below the pass mark` : 'All scenarios passed' });
      reload();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <AgentSwitcher current={data.agent} />
          <p className="mt-1 text-[13px] text-muted">Configure, evaluate, and deploy agent behavior with governed change controls</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <PresetsMenu cfg={cfg} onApply={(c, name) => { change(c); useLive.getState().toast({ tone: 'info', title: `Preset “${name}” loaded into the draft`, body: 'Review the change request, then deploy.' }); }} />
          <Button variant="secondary" size="lg" className="px-8" onClick={runEvals} loading={evalsRunning}><FlaskConical className="size-4" />Run evals</Button>
          <Button size="lg" className="px-8" disabled={!data.draft || saving} onClick={() => setDeployOpen(true)}>Review & deploy</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
        <BehaviorPanel agentId={agentId} cfg={cfg} onChange={change} draft={data.draft} version={data.agent.version} deployedAt={data.agent.deployedAt} saving={saving} />
        <PerformancePanel detail={data} failures={failures} evalsRunning={evalsRunning} />
        <div className="lg:col-span-2 xl:col-span-1">
          <SimulationConsole agentId={agentId} hasDraft={Boolean(data.draft)} draftStamp={data.draft?.updatedAt ?? data.agent.deployedAt} previousVersion={data.agent.previous?.version ?? null} />
        </div>
      </div>

      <DeployModal open={deployOpen} onClose={() => setDeployOpen(false)} detail={data} onDeployed={() => { dirty.current = false; reload(); }} evalsRanOnDraft={evalsOnDraft} />
    </div>
  );
}
