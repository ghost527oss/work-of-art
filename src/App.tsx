// @node: F1.7
// @node: F2.7
// @node: F3.5
// @node: F4.9 (calls useHarness once)
// @node: F5.11 (calls useUnderstanding once)
// @node: F6.11 (calls useScan once)
// @node: F7.10 (calls usePreview once)
// @node: F8.8 (calls useEditPad once)
// @node: F9.10 (calls useJournal and useExports once)
// @node: F10.7 (calls useSessionRestore once; composes Back to Start and Reset session)
// Switches between the Start, Loading, and Studio screens from the store's experience
// stage. One ingestion hook instance and one assistant hook instance serve every screen.
import { LoadingScene } from './components/LoadingScene';
import { StartScreen } from './components/StartScreen';
import { StudioLayout } from './components/StudioLayout';
import { useIngestion } from './hooks/useIngestion';
import { useAssistant } from './hooks/useAssistant';
import { useHarness } from './hooks/useHarness';
import { useUnderstanding } from './hooks/useUnderstanding';
import { useScan } from './hooks/useScan';
import { usePreview } from './hooks/usePreview';
import { useEditPad } from './hooks/useEditPad';
import { useExports, useJournal } from './hooks/useJournal';
import { useMemo } from 'react';
import { useSessionRestore, useSessionView } from './hooks/useSessionRestore';
import { describeSavedData } from './store/sessionRecord';
import { browserStorage } from './store/layoutStorage';
import { useLayoutPersistence } from './hooks/useLayout';
import { useShellReset } from './hooks/useShell';
import { useStudioStore } from './store/useStudioStore';

export function App() {
  const experience = useStudioStore((s) => s.experience);
  const ingestion = useIngestion();
  const assistant = useAssistant();
  const harness = useHarness(assistant);
  const understanding = useUnderstanding();
  const scan = useScan();
  const preview = usePreview();
  const editPad = useEditPad();
  const journalActions = useJournal();
  const exports = useExports();
  const journal = useMemo(() => ({ actions: journalActions, exports }), [journalActions, exports]);
  const session = useSessionRestore(ingestion, preview);
  const sessionView = useSessionView();
  const ingestionRunId = useStudioStore((s) => s.ingestion.runId);
  const studioSession = useMemo(() => ({ onReset: session.resetSession, savedRows: () => describeSavedData(browserStorage()) }), [session]);
  useLayoutPersistence();
  useShellReset();

  // The Loading screen is in restore mode while the restore load runs, and in its failure panel.
  const restoring = sessionView.status === 'pending' || (sessionView.status === 'failed' && sessionView.pendingRunId === ingestionRunId);

  switch (experience) {
    case 'loading':
      return (
        <LoadingScene
          onCancel={ingestion.cancel}
          onRetry={restoring ? session.retry : ingestion.retry}
          onSample={ingestion.startSample}
          onBack={session.backToStart}
          restore={restoring && sessionView.record ? { record: sessionView.record, onReset: session.resetSession } : undefined}
        />
      );
    case 'studio':
      return (
        <StudioLayout
          onLoadFolders={ingestion.loadFolders}
          onCancel={ingestion.cancel}
          onRetry={ingestion.retry}
          onDismissError={ingestion.dismissError}
          onBack={session.backToStart}
          assistant={assistant}
          harness={harness}
          understanding={understanding}
          scan={scan}
          preview={preview}
          editPad={editPad}
          journal={journal}
          session={studioSession}
        />
      );
    default:
      return (
        <StartScreen
          onSubmit={ingestion.submitInput}
          onSample={ingestion.startSample}
          session={{ record: sessionView.record, restoring: sessionView.status === 'pending' || sessionView.status === 'applying', notice: sessionView.notice, savedRows: describeSavedData(browserStorage()), onResume: session.resume, onReset: session.resetSession }}
        />
      );
  }
}
