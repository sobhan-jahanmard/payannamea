SAMPLE_PERCENT = 20


def sample_count(total: int) -> int:
    """Count whole pages or slides in the opening excerpt, rounding up."""
    if total < 1:
        raise ValueError("A sample requires at least one page or slide")
    return (total * SAMPLE_PERCENT + 99) // 100
