// @node: F1.7
// @node: F2.7
// @node: F3.5
// @node: F4.9 (calls useHarness once)
// @node: F5.11 (calls useUnderstanding once)
// @node: F6.11 (calls useScan once)
// @node: F7.10 (calls usePreview once)
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
  useLayoutPersistence();
  useShellReset();

  switch (experience) {
    case 'loading':
      return (
        <LoadingScene
          onCancel={ingestion.cancel}
          onRetry={ingestion.retry}
          onSample={ingestion.startSample}
          onBack={ingestion.backToStart}
        />
      );
    case 'studio':
      return (
        <StudioLayout
          onLoadFolders={ingestion.loadFolders}
          onCancel={ingestion.cancel}
          onRetry={ingestion.retry}
          onDismissError={ingestion.dismissError}
          onBack={ingestion.backToStart}
          assistant={assistant}
          harness={harness}
          understanding={understanding}
          scan={scan}
          preview={preview}
        />
      );
    default:
      return <StartScreen onSubmit={ingestion.submitInput} onSample={ingestion.startSample} />;
  }
}
