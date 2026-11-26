// @node: F1.7
// @node: F2.7
// @node: F3.5
// Switches between the Start, Loading, and Studio screens from the store's experience
// stage. One ingestion hook instance and one assistant hook instance serve every screen.
import { LoadingScene } from './components/LoadingScene';
import { StartScreen } from './components/StartScreen';
import { StudioLayout } from './components/StudioLayout';
import { useIngestion } from './hooks/useIngestion';
import { useAssistant } from './hooks/useAssistant';
import { useLayoutPersistence } from './hooks/useLayout';
import { useShellReset } from './hooks/useShell';
import { useStudioStore } from './store/useStudioStore';

export function App() {
  const experience = useStudioStore((s) => s.experience);
  const ingestion = useIngestion();
  const assistant = useAssistant();
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
        />
      );
    default:
      return <StartScreen onSubmit={ingestion.submitInput} onSample={ingestion.startSample} />;
  }
}
