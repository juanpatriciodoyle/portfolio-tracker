import { FileUp } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

interface PdfPickerProps {
  /** The PDFs chosen or dropped, at least one. */
  onFiles: (files: File[]) => void;
}

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** Choose, or drop, any number of bill PDFs at once. Nothing is uploaded until each one is reviewed. */
export default function PdfPicker({ onFiles }: PdfPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files].filter(isPdf);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      className={`pdf-picker${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <FileUp size={16} aria-hidden="true" />
      <span className="pdf-picker__text">
        Have the PDFs? Drop them here, or{' '}
        <button type="button" className="pdf-picker__button" onClick={() => input.current?.click()}>
          add from PDFs
        </button>
        .
      </span>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Choose bill PDFs"
        onChange={choose}
      />
    </div>
  );
}
