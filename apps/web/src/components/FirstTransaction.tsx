import { useId } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import Modal from './Modal';
import TransactionForm from './TransactionForm';

interface FirstTransactionProps {
  /** The dialog is showing. */
  open: boolean;
  currency: string;
  /** The first transaction was recorded: the home screen takes over from here. */
  onSaved: () => void;
  onOpenProfile: () => void;
  /** The person closed the dialog without recording anything. */
  onDismiss: () => void;
  /** The person asks for the dialog again from the quiet empty state. */
  onOpen: () => void;
}

/**
 * What a brand-new account sees instead of an empty dashboard: the quiet empty state, and over it, centred, a dialog with the
 * transaction form (the page behind is dimmed and blurred so nothing else competes). No chart, no period buttons, no legend:
 * there is nothing to draw yet. Closing the dialog leaves the empty state with one button to open it again.
 */
export default function FirstTransaction({ open, currency, onSaved, onOpenProfile, onDismiss, onOpen }: FirstTransactionProps) {
  const { t } = useTranslation();
  const emptyId = useId();

  return (
    <>
      <section className="first-transaction-empty hero__enter" aria-labelledby={emptyId}>
        <h2 id={emptyId} className="first-transaction-empty__title">
          {t('firstTransaction.empty.title')}
        </h2>
        <p className="first-transaction-empty__note">{t('firstTransaction.empty.note')}</p>
        <button type="button" className="header-primary first-transaction-empty__action" onClick={onOpen}>
          {t('firstTransaction.empty.action')}
        </button>
      </section>

      {open && (
        <Modal label={t('firstTransaction.title')} onClose={onDismiss} calm>
          <div className="first-transaction">
            <h2 className="first-transaction__title">{t('firstTransaction.title')}</h2>
            <p className="first-transaction__intro">{t('firstTransaction.intro')}</p>
            {/* The form brings its own heading ("Log Transaction"); this dialog's title says what it is for, so that one is hidden. */}
            <div className="first-transaction__form">
              <TransactionForm onSuccess={onSaved} currency={currency} />
            </div>
            <p className="first-transaction__next">
              {t('firstTransaction.nextBefore')}
              <button type="button" className="first-transaction__link" onClick={onOpenProfile}>
                {t('firstTransaction.nextLink')}
              </button>
              {t('firstTransaction.nextAfter')}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
