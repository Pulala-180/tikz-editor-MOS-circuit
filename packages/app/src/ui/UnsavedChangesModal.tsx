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
  const label = isExternal
    ? (documentTitles.length === 1
        ? `文档 "${documentTitles[0]}" 为外部打开的文件。请选择保存到原文件、转存备份到 Sketch 草稿库，或取消：`
        : `${documentTitles.length} 个外部文档有未保存修改。请选择保存、转存到 Sketch 或取消：`)
    : (documentTitles.length === 1
        ? `文档 "${documentTitles[0]}" 尚未保存到指定文件夹。请选择保存到您的电脑文件夹，或直接删除本地文件：`
        : `${documentTitles.length} 个文档尚未保存。请选择保存或直接删除：`);

  return (
    <Modal
      onClose={() => { onChoose("cancel"); }}
      closeOnBackdrop={false}
      size="md"
      labelledBy="unsaved-changes-title"
      dataTestId="unsaved-changes-modal"
    >
      <Modal.Header
        title={isExternal ? "关闭前确认：是否保存外部文件？" : "关闭前确认：保存还是删除？"}
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
          取消 (Cancel)
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
            保存在 Sketch 里
          </Modal.SecondaryButton>
        ) : (
          <Modal.DangerButton
            onClick={() => { onChoose("discard"); }}
            data-testid="unsaved-discard"
          >
            直接删除 (Delete)
          </Modal.DangerButton>
        )}

        <Modal.PrimaryButton
          onClick={() => { onChoose("save"); }}
          data-testid="unsaved-save"
        >
          {isExternal ? "保存到原文件 (Save)" : "选择位置保存 (Save)"}
        </Modal.PrimaryButton>
      </Modal.Footer>
    </Modal>
  );
}
