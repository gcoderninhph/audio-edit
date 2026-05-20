import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { cancelIapPayment, createIapPayment, fetchIapPayment, fetchIapPaymentQrBlob } from '../../utils/iapClient';
import { getStoredAuthSession, saveAuthSession } from '../../utils/authClient';
import {
  PackagePreviewCard,
  PaymentInfoTable,
} from './PaymentQrDialogShared';
import {
  buildPackageBenefits,
  buildPendingRows,
  buildReviewRows,
  formatPrice,
} from './paymentQrDialogModel';
import './PaymentQrDialog.css';

function getRemainingSeconds(payment) {
  if (!payment?.expiresAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((Number(payment.expiresAt) * 1000 - Date.now()) / 1000));
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function persistUpdatedUser(user) {
  if (!user?.id) {
    return;
  }
  const currentSession = getStoredAuthSession();
  if (!currentSession?.accessToken) {
    return;
  }
  saveAuthSession({ ...currentSession, user });
}

export default function PaymentQrDialog({ locatorCode, onClose, packageRecord }) {
  const [error, setError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isQrImageUnavailable, setIsQrImageUnavailable] = useState(false);
  const [payment, setPayment] = useState(null);
  const qrImageObjectUrlRef = useRef('');
  const [qrImagePaymentId, setQrImagePaymentId] = useState(0);
  const [qrImageSrc, setQrImageSrc] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [status, setStatus] = useState('review');
  const packageBenefits = useMemo(() => buildPackageBenefits(packageRecord), [packageRecord]);
  const paymentLabel = formatPrice(packageRecord?.price, packageRecord?.currency);
  const reviewRows = useMemo(() => buildReviewRows(packageRecord, paymentLabel), [packageRecord, paymentLabel]);
  const pendingRows = useMemo(() => buildPendingRows(payment, remainingSeconds, formatCountdown), [payment, remainingSeconds]);
  const activeQrImageSrc = status === 'pending' && payment?.id === qrImagePaymentId ? qrImageSrc : '';
  const isActiveQrUnavailable = status === 'pending' && payment?.id === qrImagePaymentId && isQrImageUnavailable;

  useEffect(() => {
    if (!payment || status !== 'pending' || isCancelling) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(payment));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isCancelling, payment, status]);

  useEffect(() => {
    if (!payment?.id || status !== 'pending' || isCancelling) {
      return undefined;
    }

    let isCancelled = false;
    const pollPayment = async () => {
      try {
        const payload = await fetchIapPayment(payment.id);
        if (isCancelled) {
          return;
        }
        const nextPayment = payload.payment;
        setPayment(nextPayment);
        if (nextPayment?.status === 'paid') {
          persistUpdatedUser(payload.user);
          setStatus('success');
        } else if (nextPayment?.status === 'failed' || nextPayment?.status === 'expired') {
          setError(nextPayment.failureReason || 'Payment was not completed.');
          setStatus('failed');
        }
      } catch (pollError) {
        if (!isCancelled) {
          setError(pollError.message || 'Unable to check payment status.');
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void pollPayment();
    }, 1000);
    void pollPayment();
    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isCancelling, payment?.id, status]);

  useEffect(() => {
    if (!payment?.id || status !== 'pending' || isCancelling) {
      return undefined;
    }

    let isCancelled = false;
    if (qrImageObjectUrlRef.current) {
      window.URL.revokeObjectURL(qrImageObjectUrlRef.current);
      qrImageObjectUrlRef.current = '';
    }

    const loadQrImage = async () => {
      try {
        const qrBlob = await fetchIapPaymentQrBlob(payment.id);
        if (isCancelled) {
          return;
        }
        const nextObjectUrl = window.URL.createObjectURL(qrBlob);
        qrImageObjectUrlRef.current = nextObjectUrl;
        setIsQrImageUnavailable(false);
        setQrImagePaymentId(payment.id);
        setQrImageSrc(nextObjectUrl);
      } catch {
        if (!isCancelled) {
          setIsQrImageUnavailable(true);
          setQrImagePaymentId(payment.id);
          setQrImageSrc('');
        }
      }
    };

    void loadQrImage();

    return () => {
      isCancelled = true;
      if (qrImageObjectUrlRef.current) {
        window.URL.revokeObjectURL(qrImageObjectUrlRef.current);
        qrImageObjectUrlRef.current = '';
      }
    };
  }, [isCancelling, payment?.id, status]);

  useEffect(() => () => {
    if (qrImageObjectUrlRef.current) {
      window.URL.revokeObjectURL(qrImageObjectUrlRef.current);
      qrImageObjectUrlRef.current = '';
    }
  }, []);

  const handleStartPayment = async () => {
    setIsStarting(true);
    setIsQrImageUnavailable(false);
    setQrImagePaymentId(0);
    setQrImageSrc('');
    setError('');
    try {
      const payload = await createIapPayment(packageRecord.id);
      setPayment(payload.payment);
      setRemainingSeconds(getRemainingSeconds(payload.payment));
      setStatus('pending');
    } catch (startError) {
      setError(startError.message || 'Unable to create payment ticket.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRequestClose = async () => {
    if (isCancelling) {
      return;
    }
    if (!payment?.id || status !== 'pending') {
      onClose();
      return;
    }

    setIsCancelling(true);
    setError('');
    try {
      await cancelIapPayment(payment.id);
      setIsCancelling(false);
      onClose();
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel payment ticket.');
      setIsCancelling(false);
    }
  };

  const handleBackdropMouseDown = (event) => {
    event.stopPropagation();
    void handleRequestClose();
  };

  const dialog = (
    <div className="payment-dialog-backdrop" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <section className="payment-dialog dev-locator-host" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <DeveloperLocator code={locatorCode} title="IAP QR Payment Popup" />
        <div className="payment-dialog-header">
          <div>
            <p className="premium-dialog-kicker">QR payment</p>
            <h2>{packageRecord?.name || 'IAP package'}</h2>
            <p className="premium-dialog-note">Review the package first. After confirmation, the app creates a 3-minute payment ticket and shows the Sepay QR with the exact transfer content.</p>
          </div>
          <button type="button" className="premium-dialog-close" onClick={() => void handleRequestClose()} aria-label="Close QR payment dialog" disabled={isCancelling}>×</button>
        </div>

        {error && <div className="premium-dialog-alert premium-dialog-alert-error">{error}</div>}
        {isCancelling && (
          <div className="premium-dialog-state dev-locator-host">
            <DeveloperLocator code={`${locatorCode}.pending.cancelling`} title="QR Payment Cancelling State" />
            Cancelling payment ticket on the server...
          </div>
        )}

        {status === 'review' && (
          <div className="payment-review-layout">
            <div className="payment-package-preview">
              <PackagePreviewCard
                locatorCode={`${locatorCode}.review.card`}
                packageBenefits={packageBenefits}
                packageRecord={packageRecord}
                paymentLabel={paymentLabel}
              />
            </div>
            <div className="payment-stage-panel">
              <div className="payment-stage-block dev-locator-host">
                <DeveloperLocator code={`${locatorCode}.review.summary`} title="QR Payment Review Summary" />
                <div className="payment-stage-heading">
                  <p>Payment summary</p>
                  <h3>Review details</h3>
                </div>
                <PaymentInfoTable rows={reviewRows} />
              </div>
              <div className="payment-review-actions dev-locator-host">
                <DeveloperLocator code={`${locatorCode}.review.actions`} title="QR Payment Review Actions" />
                <button type="button" className="payment-secondary-button" onClick={() => void handleRequestClose()} disabled={isStarting || isCancelling}>Cancel</button>
                <button type="button" className="premium-package-cta payment-confirm-button" onClick={handleStartPayment} disabled={isStarting || isCancelling}>
                  {isStarting ? 'Creating payment...' : 'Confirm payment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {status === 'pending' && payment && (
          <div className="payment-review-layout">
            <div className="payment-package-preview">
              <PackagePreviewCard
                locatorCode={`${locatorCode}.pending.card`}
                packageBenefits={packageBenefits}
                packageRecord={packageRecord}
                paymentLabel={paymentLabel}
              />
            </div>
            <div className="payment-stage-panel">
              <div className="payment-stage-block dev-locator-host">
                <DeveloperLocator code={`${locatorCode}.pending.summary`} title="QR Payment Pending Summary" />
                <div className="payment-stage-heading">
                  <p>Payment details</p>
                  <h3>Transfer information</h3>
                </div>
                <PaymentInfoTable rows={pendingRows} />
              </div>
              <div className="payment-qr-panel dev-locator-host">
                <DeveloperLocator code={`${locatorCode}.pending.qr`} title="QR Payment QR Panel" />
                <div className="payment-qr-meta">
                  <div><span>Transaction status</span><strong>Waiting for payment confirmation</strong></div>
                  <div><span>Polling</span><strong>Checking payment status every 1 second</strong></div>
                  <p className="payment-status-note">Transfer the exact amount to the current beneficiary account and keep the transfer content unchanged so the server can validate the ticket automatically.</p>
                </div>
                <div className="payment-qr-visual">
                  {activeQrImageSrc && !isActiveQrUnavailable ? (
                    <img
                      className="payment-qr-image"
                      src={activeQrImageSrc}
                      alt="Sepay QR payment code"
                      loading="eager"
                      onError={() => setIsQrImageUnavailable(true)}
                    />
                  ) : (
                    <div className="premium-dialog-state">Unable to load the QR image. Please transfer manually with the payment details shown here.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="payment-review-stack">
            <div className="payment-result-panel payment-result-success">
              <strong>Payment successful</strong>
              <span>Your account has been updated.</span>
            </div>
            <div className="payment-review-actions">
              <button type="button" className="premium-package-cta payment-confirm-button" onClick={() => void handleRequestClose()}>Close</button>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="payment-review-stack">
            <div className="payment-result-panel payment-result-failed">
              <strong>Payment not completed</strong>
              <span>{error || 'The payment ticket is no longer active.'}</span>
            </div>
            <div className="payment-review-actions">
              <button type="button" className="payment-secondary-button" onClick={() => void handleRequestClose()}>Close</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  if (typeof document === 'undefined') {
    return dialog;
  }
  return createPortal(dialog, document.body);
}



