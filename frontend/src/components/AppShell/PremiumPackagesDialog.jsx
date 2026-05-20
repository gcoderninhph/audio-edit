import { useEffect, useMemo, useRef, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { fetchPublicPremiumPackages } from '../../utils/iapClient';
import PaymentQrDialog from './PaymentQrDialog';
import './PremiumPackagesDialog.css';

const MAX_PACKAGES_PER_PAGE = 3;

function getViewportWidth() {
  if (typeof window === 'undefined') {
    return 1280;
  }
  return window.innerWidth || 1280;
}

function resolveCardsPerPage(viewportWidth) {
  if (viewportWidth <= 680) {
    return 1;
  }
  if (viewportWidth <= 1080) {
    return 2;
  }
  return MAX_PACKAGES_PER_PAGE;
}

function buildPackageKey(packageRecord) {
  return packageRecord.id || `${packageRecord.packType}-${packageRecord.name}`;
}

function chunkPackages(packages, pageSize) {
  const safePageSize = Math.max(1, pageSize || 1);
  const pages = [];

  for (let index = 0; index < packages.length; index += safePageSize) {
    pages.push(packages.slice(index, index + safePageSize));
  }

  return pages;
}

function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      currency: currency || 'USD',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0)} ${currency || 'USD'}`;
  }
}

function parseDescriptionFeatures(description) {
  const normalizedDescription = String(description || '').trim();
  if (!normalizedDescription) {
    return [];
  }

  const descriptionLines = normalizedDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const featureItems = descriptionLines.flatMap((line) => {
    if (line.startsWith('- ')) {
      return line
        .split(/\s+-\s+/)
        .map((segment) => segment.replace(/^-\s*/, '').trim())
        .filter(Boolean);
    }

    if (line.includes(' - ')) {
      return line.split(/\s+-\s+/).map((segment) => segment.trim()).filter(Boolean);
    }

    return [line];
  });

  return featureItems.filter(Boolean);
}

function buildFeatureList(packageRecord) {
  const features = [
    'No G Studio watermark in preview',
    'No G Studio watermark in export',
  ];

  if (packageRecord.packType === 'creditsAndPremiumPack' && packageRecord.credits > 0) {
    features.push(`${packageRecord.credits} credits included`);
  }

  features.push(...parseDescriptionFeatures(packageRecord.description));

  return features.slice(0, 4);
}

function resolveFallbackRecommendedIndex(packages) {
  const creditsAndPremiumIndex = packages.findIndex((record) => record.packType === 'creditsAndPremiumPack');
  if (creditsAndPremiumIndex >= 0) {
    return creditsAndPremiumIndex;
  }
  if (packages.length >= 3) {
    return Math.floor(packages.length / 2);
  }
  return packages.length > 1 ? 1 : 0;
}

function resolveRecommendedKeys(packages) {
  const explicitRecommendedKeys = packages
    .filter((packageRecord) => packageRecord.isRecommended)
    .map((packageRecord) => buildPackageKey(packageRecord));

  if (explicitRecommendedKeys.length > 0) {
    return new Set(explicitRecommendedKeys);
  }

  const fallbackRecord = packages[resolveFallbackRecommendedIndex(packages)];
  return fallbackRecord ? new Set([buildPackageKey(fallbackRecord)]) : new Set();
}

function resolveInitialPageIndex(packages, cardsPerPage) {
  const recommendedKeys = resolveRecommendedKeys(packages);
  const recommendedIndex = packages.findIndex((packageRecord) => recommendedKeys.has(buildPackageKey(packageRecord)));
  if (recommendedIndex < 0) {
    return 0;
  }
  return Math.floor(recommendedIndex / Math.max(1, cardsPerPage));
}

export default function PremiumPackagesDialog({ auth, locatorCode, onClose, open }) {
  const carouselRef = useRef(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [paymentPackage, setPaymentPackage] = useState(null);
  const [cardsPerPage, setCardsPerPage] = useState(() => resolveCardsPerPage(getViewportWidth()));
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      const nextCardsPerPage = resolveCardsPerPage(getViewportWidth());
      setCardsPerPage((current) => (current === nextCardsPerPage ? current : nextCardsPerPage));
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let isCancelled = false;
    Promise.resolve().then(() => {
      if (isCancelled) {
        return undefined;
      }

      setIsLoading(true);
      setError('');

      return fetchPublicPremiumPackages()
        .then((nextPackages) => {
          if (isCancelled) {
            return;
          }
          setPackages(nextPackages);
          setActivePage(resolveInitialPageIndex(nextPackages, resolveCardsPerPage(getViewportWidth())));
        })
        .catch((loadError) => {
          if (isCancelled) {
            return;
          }
          setError(loadError.message || 'Unable to load premium plans.');
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [open]);

  const packagePages = useMemo(() => chunkPackages(packages, cardsPerPage), [cardsPerPage, packages]);
  const recommendedKeys = useMemo(() => resolveRecommendedKeys(packages), [packages]);
  const activePageIndex = packagePages.length ? Math.max(0, Math.min(activePage, packagePages.length - 1)) : 0;
  const isPremium = Boolean(auth?.user?.isPremium);
  const headerNote = isPremium
    ? 'This account already has premium active. Plans below are still visible for later purchase flows.'
    : 'Choose a premium plan from the server catalog. Buy buttons are placeholders for now.';

  useEffect(() => {
    if (!open || !packagePages.length) {
      return;
    }

    const carouselNode = carouselRef.current;
    if (!carouselNode) {
      return;
    }

    const targetLeft = carouselNode.clientWidth * activePageIndex;
    if (Math.abs(carouselNode.scrollLeft - targetLeft) < 2) {
      return;
    }

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    carouselNode.scrollTo({
      left: targetLeft,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [activePageIndex, open, packagePages.length]);

  function handleCarouselScroll(event) {
    const carouselNode = event.currentTarget;
    if (!carouselNode.clientWidth) {
      return;
    }

    const nextPage = Math.round(carouselNode.scrollLeft / carouselNode.clientWidth);
    setActivePage((current) => (current === nextPage ? current : nextPage));
  }

  function handlePageChange(nextPage) {
    const pageCount = packagePages.length;
    if (!pageCount) {
      return;
    }
    setActivePage(Math.max(0, Math.min(nextPage, pageCount - 1)));
  }

  function handleClosePaymentDialog() {
    setPaymentPackage(null);
  }

  if (!open) {
    return null;
  }

  return (
    <div className="premium-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="premium-dialog dev-locator-host"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DeveloperLocator code={`${locatorCode}.premium-popup`} title="Premium Packages Popup" />
        <div className="premium-dialog-header">
          <div>
            <p className="premium-dialog-kicker">Premium access</p>
            <h2 id="premium-dialog-title">Choose your plan</h2>
            <p className="premium-dialog-note">{headerNote}</p>
          </div>
          <button type="button" className="premium-dialog-close" onClick={onClose} aria-label="Close premium plans dialog">×</button>
        </div>

        {error && <div className="premium-dialog-alert premium-dialog-alert-error">{error}</div>}

        {isLoading && (
          <div className="premium-dialog-state dev-locator-host">
            <DeveloperLocator code={`${locatorCode}.premium-popup.loading`} title="Premium Popup Loading" />
            Loading premium plans...
          </div>
        )}

        {!isLoading && !error && !packages.length && (
          <div className="premium-dialog-state dev-locator-host">
            <DeveloperLocator code={`${locatorCode}.premium-popup.empty`} title="Premium Popup Empty" />
            No premium plans are available right now.
          </div>
        )}

        {!isLoading && packages.length > 0 && (
          <div className="premium-packages-shell dev-locator-host">
            <DeveloperLocator code={`${locatorCode}.premium-popup.list`} title="Premium Popup Package List" />
            {packagePages.length > 1 && (
              <div className="premium-packages-toolbar">
                <p className="premium-packages-hint">Swipe horizontally or use the arrows to browse more plans.</p>
                <div className="premium-packages-controls">
                  <button
                    type="button"
                    className="premium-packages-nav"
                    onClick={() => handlePageChange(activePageIndex - 1)}
                    disabled={activePageIndex === 0}
                  >
                    Previous
                  </button>
                  <div className="premium-packages-pagination" aria-label="Premium plan pages">
                    {packagePages.map((pagePackages, pageIndex) => (
                      <button
                        key={`premium-page-dot-${pagePackages.map((packageRecord) => buildPackageKey(packageRecord)).join('-')}`}
                        type="button"
                        className={`premium-packages-dot${pageIndex === activePageIndex ? ' premium-packages-dot-active' : ''}`}
                        onClick={() => handlePageChange(pageIndex)}
                        aria-label={`Go to premium plan page ${pageIndex + 1}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="premium-packages-nav"
                    onClick={() => handlePageChange(activePageIndex + 1)}
                    disabled={activePageIndex >= packagePages.length - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            <div className="premium-packages-carousel" ref={carouselRef} onScroll={handleCarouselScroll}>
              {packagePages.map((pagePackages, pageIndex) => (
                <div
                  key={`premium-page-${pageIndex + 1}`}
                  className="premium-packages-page"
                  aria-label={`Premium plan page ${pageIndex + 1} of ${packagePages.length}`}
                >
                  {pagePackages.map((packageRecord, pageItemIndex) => {
                    const packageKey = buildPackageKey(packageRecord);
                    const isRecommended = recommendedKeys.has(packageKey);
                    const features = buildFeatureList(packageRecord);
                    const absoluteIndex = pageIndex * cardsPerPage + pageItemIndex;
                    return (
                      <article
                        key={packageKey}
                        className={`premium-package-card dev-locator-host${isRecommended ? ' premium-package-card-recommended' : ''}`}
                      >
                        <DeveloperLocator
                          code={`${locatorCode}.premium-popup.card.${packageRecord.id || absoluteIndex}`}
                          title="Premium Popup Package Card"
                        />
                        <div className="premium-package-header-block">
                          <div className="premium-package-type">{packageRecord.packType === 'creditsAndPremiumPack' ? 'Credits + premium' : 'Premium'}</div>
                          <div className="premium-package-title-row">
                            <h3>{packageRecord.name}</h3>
                            {isRecommended && <span className="premium-package-badge">Recommended</span>}
                          </div>
                        </div>
                        <div className="premium-package-price">{formatPrice(packageRecord.price, packageRecord.currency)}</div>
                        <ul className="premium-package-features">
                          {features.map((feature) => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="premium-package-cta"
                          onClick={() => setPaymentPackage(packageRecord)}
                        >
                          Buy now
                        </button>
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        {paymentPackage && (
          <PaymentQrDialog
            locatorCode={`${locatorCode}.premium-popup.payment`}
            onClose={handleClosePaymentDialog}
            packageRecord={paymentPackage}
          />
        )}
      </section>
    </div>
  );
}