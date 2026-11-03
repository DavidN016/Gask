import time


class TTLCache:
    """In-memory cache so repeat searches from one spot don't each bill a Places call."""

    def __init__(self, ttl_seconds):
        self.ttl_seconds = ttl_seconds
        self._items = {}

    def get(self, key):
        item = self._items.get(key)
        if item is None or item[0] <= time.monotonic():
            return None
        return item[1]

    def set(self, key, value):
        now = time.monotonic()
        self._items = {k: v for k, v in self._items.items() if v[0] > now}
        self._items[key] = (now + self.ttl_seconds, value)
