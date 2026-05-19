import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatNumber } from '../utils/format'

export default function Pagination({ pagination, itemLabel, onPageChange }) {
  const safePagination = pagination || { page: 1, totalPages: 1, totalItems: 0, hasNext: false, hasPrevious: false }

  return (
    <div className="pagination-bar">
      <button type="button" className="icon-text-button" disabled={!safePagination.hasPrevious} onClick={() => onPageChange(safePagination.page - 1)}>
        <ChevronLeft size={16} /> Previous
      </button>
      <span>Page {safePagination.page} of {safePagination.totalPages} · {formatNumber(safePagination.totalItems)} {itemLabel}</span>
      <button type="button" className="icon-text-button" disabled={!safePagination.hasNext} onClick={() => onPageChange(safePagination.page + 1)}>
        Next <ChevronRight size={16} />
      </button>
    </div>
  )
}