"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Input } from "@/components/ui/input";

type FileUploadControlProps = {
  name: string;
  accept?: string;
  required?: boolean;
  label?: string;
  hint?: string;
  className?: string;
  controlClassName?: string;
  onFileChange?: (file: File | null) => void;
};

export function FileUploadControl({
  name,
  accept = "application/pdf,image/jpeg,image/png,image/webp",
  required,
  label = "Fayl seç",
  hint = "PDF / şəkil",
  className,
  controlClassName,
  onFileChange,
}: FileUploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewId = useId();
  const [file, setFile] = useState<File | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    onFileChange?.(next);
  }

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setFile(null);
    onFileChange?.(null);
  }

  return (
    <div className={cx("file-upload-control", className)}>
      <span className={cx("finance-file-control", controlClassName)}>
        <Upload size={14} aria-hidden="true" />
        <strong>{file ? "Faylı dəyiş" : label}</strong>
        <small>{hint}</small>
        <Input
          ref={inputRef}
          name={name}
          type="file"
          accept={accept}
          required={required}
          aria-describedby={file ? previewId : undefined}
          onChange={handleChange}
        />
      </span>

      {file ? (
        <div id={previewId} className="file-upload-preview" role="status">
          <span className="file-upload-preview-icon" aria-hidden="true">
            <FileText size={14} />
          </span>
          <span className="file-upload-preview-copy">
            <strong title={file.name}>{file.name}</strong>
            <small>{formatFileSize(file.size)}</small>
          </span>
          <button
            type="button"
            className="file-upload-preview-clear"
            aria-label="Seçilmiş faylı sil"
            onClick={clearFile}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
