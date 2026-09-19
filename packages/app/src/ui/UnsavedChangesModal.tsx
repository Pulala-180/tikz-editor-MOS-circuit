import { Modal } from "./Modal";
import css from "./UnsavedChangesModal.module.css";

export type UnsavedChangesDecision = "save" | "discard" | "save-to-sketch" | "cancel";

export function UnsavedChangesModal({
  documentTitles,
  isExternal = false,
  onChoose
}: {
  documentTitles: string[];
  isExternal?: boolean;
  onChoose: (decision: UnsavedChangesDecision) => void;
}) {
  const isAllUntitled = documentTitles.every((title) => title.startsWith("Untitled"));
  const label = isExternal
    ? (documentTitles.length === 1
        ? `外部文件 "${documentTitles[0]}" 存在未保存的修改。当前画板有未保存的修改，是否保存后关闭？`
        : `${documentTitles.length} 个外部文档有未保存的修改。当前画板有未保存的修改，是否保存后关闭？`)
    : (documentTitles.length === 1
        ? "当前画板有未保存的修改，是否保存后关闭？"
        : `${documentTitles.length} 个文档有未保存的修改。当前画板有未保存的修改，是否保存后关闭？`);

  return (
    <Modal
      onClose={() => { onChoose("cancel"); }}
      closeOnBackdrop={false}
      size="md"
      labelledBy="unsaved-changes-title"
      dataTestId="unsaved-changes-modal"
    >
      <Modal.Header
        title={isExternal ? "是否保存外部文件？" : "未保存的修改"}
        titleId="unsaved-changes-title"
      />
      <Modal.Body>
        <p className={css.message} data-select="text">{label}</p>
        {documentTitles.length > 1 ? (
          <ul className={css.list} data-select="text">
            {documentTitles.map((title, index) => (
              <li key={`${title}-${index}`}>{title}</li>
            ))}
          </ul>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Modal.SecondaryButton
          onClick={() => { onChoose("cancel"); }}
          data-testid="unsaved-cancel"
        >
          取消
        </Modal.SecondaryButton>

        {isExternal ? (
          <Modal.SecondaryButton
            onClick={() => { onChoose("save-to-sketch"); }}
            data-testid="unsaved-save-to-sketch"
            style={{
              borderColor: "var(--accent, #3b82f6)",
              color: "var(--accent, #3b82f6)",
              fontWeight: 500
            }}
          >
            转存到草稿库
          </Modal.SecondaryButton>
        ) : (
          <Modal.DangerButton
            onClick={() => { onChoose("discard"); }}
            data-testid="unsaved-discard"
          >
            {isAllUntitled ? "删除草稿" : "不保存"}
          </Modal.DangerButton>
        )}

        <Modal.PrimaryButton
          onClick={() => { onChoose("save"); }}
          data-testid="unsaved-save"
        >
          {isExternal ? "保存到原文件" : "保存"}
        </Modal.PrimaryButton>
      </Modal.Footer>
    </Modal>
  );
}
