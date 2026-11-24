// @node: F1.7
// Switches between the Start, Loading, and Studio screens from the store's experience
// stage. One ingestion hook instance serves every screen.
import { LoadingScene } from './components/LoadingScene';
import { StartScreen } from './components/StartScreen';
import { StudioLayout } from './components/StudioLayout';
import { useIngestion } from './hooks/useIngestion';
import { useStudioStore } from './store/useStudioStore';

export function App() {
  const experience = useStudioStore((s) => s.experience);
  const ingestion = useIngestion();

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
        />
      );
    default:
      return <StartScreen onSubmit={ingestion.submitInput} onSample={ingestion.startSample} />;
  }
}
