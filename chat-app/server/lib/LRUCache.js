class LRUCache {
  constructor(maxSize = 500, ttl = 60000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, createdAt: Date.now() });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export default LRUCache;
