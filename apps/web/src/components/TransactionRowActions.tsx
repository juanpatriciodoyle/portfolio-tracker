import { Pencil } from 'lucide-react';
import { intlLocale } from '../i18n/locale';
import { useTranslation } from '../i18n/useTranslation';
import { describeRow, type EditableTransaction } from '../lib/transactionRows';
import DeleteTransactionButton from './DeleteTransactionButton';

interface TransactionRowActionsProps {
  tx: EditableTransaction;
  onEdit: (tx: EditableTransaction) => void;
  onDeleted: () => void;
  onStale: () => void;
}

/** Edit and Delete for one history row: icon buttons named after the transaction they act on. */
export default function TransactionRowActions({ tx, onEdit, onDeleted, onStale }: TransactionRowActionsProps) {
  const { t, locale } = useTranslation();
  return (
    <span className="tx-actions">
      <button type="button" className="tx-action" aria-label={t('history.editRow', { action: describeRow(tx, t, intlLocale(locale)) })} onClick={() => onEdit(tx)}>
        <Pencil size={16} aria-hidden="true" />
      </button>
      <DeleteTransactionButton tx={tx} onDeleted={onDeleted} onStale={onStale} />
    </span>
  );
}
