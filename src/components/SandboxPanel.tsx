// @node: F7.9
// The Sandbox panel: the locked preview iframe and its controls. The iframe is built from `srcdoc` only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyCorrections } from '../engine/understandingView';
import { hashText } from '../engine/diffApply';
import { practiceContent } from '../engine/practiceScript';
import type { PreviewActions, LayoutRunner } from '../hooks/usePreview';
import { buildWorkbench } from '../preview/workbenchDocument';
import { buildStaticPreview, type PreviewBuild } from '../preview/previewDocument';
import { gatherMeasurements } from '../preview/previewDom';
import { cspFor, IFRAME_ATTRS, sandboxFlags } from '../preview/previewFlags';
import { detectPreviewMode, modeChoices, type PreviewMode } from '../preview/previewMode';
import { useStudioStore } from '../store/useStudioStore';
import { ConsolePane, PreviewNotes, PreviewToolbar, ScriptsSwitch, SourceViewer, WorkbenchPicker } from './PreviewParts';

function randomHex(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SandboxPanel({ preview }: { preview: PreviewActions }) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const applied = useStudioStore((s) => s.work.applied);
  const pv = useStudioStore((s) => s.preview);
  const analysis = useStudioStore((s) => s.understanding.result);
  const corrections = useStudioStore((s) => s.understanding.corrections);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const loads = useRef(0);
  const autoRan = useRef('');
  const [reloadN, setReloadN] = useState(0);
  const keyRef = useRef('');

  const effective = useMemo(() => (p: string) => (snapshot ? practiceContent(snapshot, applied, p) : undefined), [snapshot, applied]);
  const nonce = useMemo(() => randomHex(), [pv.scripts, snapshot?.id]);
  const origin = typeof window !== 'undefined' && /^https?:\/\//.test(window.location.origin) ? window.location.origin : 'http://localhost';
  const loaded = useMemo(() => new Set((snapshot?.files ?? []).filter((f) => typeof f.content === 'string').map((f) => f.path)), [snapshot]);
  const detection = useMemo(() => (snapshot ? detectPreviewMode(snapshot, effective) : null), [snapshot, effective]);
  const choices: PreviewMode[] = detection ? modeChoices(detection) : ['source'];
  const contentKey = useMemo(() => hashText(`${snapshot?.id}|${applied.map((a) => a.id).join(',')}|${pv.entryPath}`), [snapshot?.id, applied, pv.entryPath]);

  keyRef.current = contentKey;
  useEffect(() => { preview.init(); }, [preview, snapshot]);

  const build = useMemo<(PreviewBuild & { components?: Array<import('../preview/workbenchDocument').WorkbenchComponent>; chosen?: string }) | null>(() => {
    try {
      if (!snapshot) return null;
      if (pv.mode === 'static' && pv.entryPath) return buildStaticPreview({ entryPath: pv.entryPath, effective, loaded, scripts: pv.scripts, nonce, origin });
      if (pv.mode === 'workbench') return buildWorkbench({ paths: [...loaded], effective, analysis, componentKey: pv.component, nonce, origin });
      return null;
    } catch {
      return { ok: false, reason: 'The preview could not be built.' };
    }
  }, [snapshot, pv.mode, pv.entryPath, pv.scripts, pv.component, effective, loaded, nonce, origin, analysis]);

  useEffect(() => {
    loads.current = 0;
    if (build) preview.setBuilt(build.ok, build.ok ? build.notes : [], build.ok ? undefined : build.reason);
  }, [build, preview]);

  useEffect(() => { preview.markContent(contentKey); }, [preview, contentKey]);

  useEffect(() => {
    if (!pv.scripts || !frame.current?.contentWindow) return undefined;
    preview.startBridge(frame.current.contentWindow, nonce);
    return () => preview.stopBridge();
  }, [preview, pv.scripts, nonce, build]);

  const canMeasure = pv.mode === 'static' && !pv.scripts && pv.status === 'ready' && !!build && build.ok && pv.layout.status !== 'running';
  const runner = (): LayoutRunner | null => {
    const f = frame.current;
    if (!f || !build || !build.ok) return null;
    return {
      setWidth: (px) => { f.style.width = `${px}px`; },
      restore: () => { f.style.width = pv.width === 0 ? '100%' : `${pv.width}px`; },
      measure: () => {
        const d = f.contentDocument;
        // Not the built document yet (the frame briefly shows an empty page while srcdoc loads).
        if (!d || !f.contentWindow || d.readyState !== 'complete' || !d.documentElement || d.URL !== 'about:srcdoc') return null;
        return gatherMeasurements(d, f.contentWindow);
      },
      elements: build.elements,
      contentKey,
    };
  };
  const check = (widths: number[]) => { const r = runner(); if (r) void preview.checkLayout(r, widths, () => keyRef.current); };
  useEffect(() => {
    if (canMeasure && autoRan.current !== contentKey && pv.layout.status === 'idle') { autoRan.current = contentKey; check([pv.width === 0 ? 1024 : pv.width]); }
  });

  if (!snapshot) return null;
  const noMeasure = pv.scripts ? 'Not available while scripts run.' : pv.mode !== 'static' ? 'Only static pages can be measured.' : pv.status !== 'ready' ? 'Wait for the preview to load.' : null;
  const files = analysis ? applyCorrections(analysis, corrections) : [];
  return (
    <section className="sandbox" aria-labelledby="sandbox-heading">
      <h2 id="sandbox-heading">Sandbox</h2>
      <PreviewToolbar
        mode={pv.mode} choices={choices} width={pv.width} scripts={pv.scripts} canMeasure={canMeasure} measureReason={noMeasure}
        onMode={preview.setMode} onWidth={preview.setWidth} onReload={() => { loads.current = 0; setReloadN((n) => n + 1); }}
        onCheck={() => check([pv.width === 0 ? 1024 : pv.width])} onCheckAll={() => check([375, 768, 1024])}
      />
      <PreviewNotes reason={pv.reason} mode={pv.mode} notes={pv.notes} invalid={pv.invalidMessages} />
      {pv.layout.status === 'running' && <p role="status">Checking layout...</p>}
      {pv.layout.status === 'done' && <p>Layout check: {pv.layout.findings.length} findings at {pv.layout.widths.join(', ')} px.{pv.layout.partialReasons.length > 0 ? ` Partial result: ${pv.layout.partialReasons.join(' ')}` : ''}</p>}
      {pv.layout.status === 'stopped' && <p role="alert">{pv.layout.message}</p>}
      {pv.layout.status === 'idle' && pv.layout.message && <p className="note">{pv.layout.message}</p>}
      {pv.mode === 'static' && <ScriptsSwitch on={pv.scripts} available onTurnOn={() => preview.setScripts(true)} onStop={() => preview.setScripts(false)} />}
      {pv.mode === 'workbench' && build && 'components' in build && build.components && (
        <WorkbenchPicker components={build.components} chosen={pv.component ?? build.chosen} onPick={preview.setComponent} />
      )}
      {build && !build.ok && <p role="alert">The preview could not be built: {build.reason} <button type="button" onClick={() => preview.setWidth(pv.width)}>Try again</button></p>}
      {pv.mode !== 'source' && build && build.ok && (
        <div className="preview-frame-box">
          <iframe
            key={`${pv.mode}-${pv.scripts}-${contentKey}-${pv.component ?? ''}-${nonce}-${reloadN}`}
            ref={frame}
            title={IFRAME_ATTRS.title}
            sandbox={sandboxFlags(pv.scripts)}
            srcDoc={build.html}
            referrerPolicy={IFRAME_ATTRS.referrerPolicy}
            allow={IFRAME_ATTRS.allow}
            {...({ csp: cspFor(pv.scripts) } as object)}
            style={{ width: pv.width === 0 ? '100%' : `${pv.width}px` }}
            onLoad={() => {
              // In look-only mode only the built document counts (an empty first page can fire load too).
              const d = frame.current?.contentDocument;
              if (!pv.scripts && (!d || d.URL !== 'about:srcdoc')) return;
              loads.current += 1;
              preview.onFrameLoad(loads.current);
            }}
          />
        </div>
      )}
      {pv.scripts && <ConsolePane lines={pv.console} />}
      {(pv.mode === 'source' || (build && !build.ok)) && (
        <SourceViewer
          files={files} loaded={loaded} contentOf={effective}
          notReadReason={(p) => snapshot.inventory.entries.find((e) => e.path === p)?.reason}
        />
      )}
    </section>
  );
}
