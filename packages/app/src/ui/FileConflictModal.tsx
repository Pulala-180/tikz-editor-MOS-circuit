import { Modal } from "./Modal";
import css from "./UnsavedChangesModal.module.css";

export type FileConflictDecision = "reload" | "save-anyway" | "save-as" | "cancel";

export function FileConflictModal({
  documentTitle,
  onChoose
}: {
  documentTitle: string;
  onChoose: (decision: FileConflictDecision) => void;
}) {
  return (
    <Modal
      onClose={() => { onChoose("cancel"); }}
      closeOnBackdrop={false}
      size="sm"
      labelledBy="file-conflict-title"
      dataTestId="file-conflict-modal"
    >
      <Modal.Header title="外部文件已被修改" titleId="file-conflict-title" />
      <Modal.Body>
        <p className={css.message} data-select="text">
          文件 &quot;{documentTitle}&quot; 已在 TikZ Editor 外部被修改。
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Modal.SecondaryButton onClick={() => { onChoose("cancel"); }} data-testid="file-conflict-cancel">
          取消
        </Modal.SecondaryButton>
        <Modal.SecondaryButton onClick={() => { onChoose("reload"); }} data-testid="file-conflict-reload">
          重新加载
        </Modal.SecondaryButton>
        <Modal.SecondaryButton onClick={() => { onChoose("save-as"); }} data-testid="file-conflict-save-as">
          另存为…
        </Modal.SecondaryButton>
        <Modal.DangerButton onClick={() => { onChoose("save-anyway"); }} data-testid="file-conflict-save-anyway">
          覆盖保存
        </Modal.DangerButton>
      </Modal.Footer>
    </Modal>
  );
}
