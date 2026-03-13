export class LRUCache {
    constructor(size) {
        this.size = size;
        this.map = new Map();
    }

    get(key) {
        if (!this.map.has(key)) return undefined;

        const value = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, value); // move to most recent
        return value;
    }

    set(key, value) {
        if (this.map.has(key)) {
            this.map.delete(key);
        }

        this.map.set(key, value);

        this._cleanup();
    }

    _cleanup() {
        if (this.map.size > this.size) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
        }
    }
}
