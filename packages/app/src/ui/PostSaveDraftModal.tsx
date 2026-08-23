import { Modal } from "./Modal";
import css from "./UnsavedChangesModal.module.css";

export function PostSaveDraftModal({
  documentTitle,
  onChoose
}: {
  documentTitle: string;
  onChoose: (deleteDraft: boolean) => void;
}) {
  return (
    <Modal
      onClose={() => { onChoose(false); }}
      closeOnBackdrop={false}
      size="md"
      labelledBy="post-save-draft-title"
      dataTestId="post-save-draft-modal"
    >
      <Modal.Header
        title="文件已保存完成"
        titleId="post-save-draft-title"
      />
      <Modal.Body>
        <p className={css.message} data-select="text">
          文档 <strong>{documentTitle}</strong> 已成功保存到所选文件夹！
          <br /><br />
          是否同时删除本地临时草稿文件？
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Modal.SecondaryButton
          onClick={() => { onChoose(false); }}
          data-testid="keep-draft-btn"
        >
          保留本地草稿 (否)
        </Modal.SecondaryButton>
        <Modal.DangerButton
          onClick={() => { onChoose(true); }}
          data-testid="delete-draft-btn"
        >
          删除本地文件 (是)
        </Modal.DangerButton>
      </Modal.Footer>
    </Modal>
  );
}
