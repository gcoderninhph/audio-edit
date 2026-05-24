import { useI18n } from '../../i18n/useI18n';

export default function AppEditorHeaderStatus({ editor, onCloseProject }) {
  const { t } = useI18n();

  return (
    <>
      {editor.isUploading && (
        <span className="status-badge uploading">
          {`⬆️ ${t('header.editor.uploading', { progress: editor.uploadProgress })}`}
        </span>
      )}
      {editor.autoSaveStatus === 'saving' && (
        <span className="status-badge saving">{`💾 ${t('header.editor.saving')}`}</span>
      )}
      {editor.autoSaveStatus === 'saved' && (
        <span className="status-badge saved">{`✅ ${t('header.editor.saved')}`}</span>
      )}
      <div className="undo-redo-btns">
        <button
          className="btn btn-ghost btn-sm"
          onClick={editor.undo}
          disabled={!editor.canUndo}
          title={t('header.editor.undoTitle')}
        >
          ↩
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={editor.redo}
          disabled={!editor.canRedo}
          title={t('header.editor.redoTitle')}
        >
          ↪
        </button>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onCloseProject}
        title={editor.isExporting ? t('header.editor.backDisabledWhileExporting') : t('header.editor.backToProjectsTitle')}
        disabled={editor.isExporting}
      >
        {`← ${t('header.editor.backToProjects')}`}
      </button>
    </>
  );
}
