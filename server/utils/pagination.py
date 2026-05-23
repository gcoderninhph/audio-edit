def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)



def normalize_page(value, default=1):
    return max(1, safe_int(value, default))



def normalize_page_size(value, default=20, minimum=1, maximum=100):
    safe_size = safe_int(value, default)
    return max(minimum, min(maximum, safe_size))



def normalize_pagination(page, page_size, default_page_size=20, minimum=1, max_page_size=100):
    return (
        normalize_page(page),
        normalize_page_size(page_size, default=default_page_size, minimum=minimum, maximum=max_page_size),
    )



def build_pagination(page, page_size, total_items):
    safe_total_items = max(0, safe_int(total_items, 0))
    total_pages = max(1, (safe_total_items + page_size - 1) // page_size)
    current_page = min(max(1, safe_int(page, 1)), total_pages)
    return {
        'page': current_page,
        'pageSize': page_size,
        'totalItems': safe_total_items,
        'totalPages': total_pages,
        'hasNext': current_page < total_pages,
        'hasPrevious': current_page > 1,
    }



def page_offset(page, page_size):
    return (normalize_page(page) - 1) * normalize_page_size(page_size)
