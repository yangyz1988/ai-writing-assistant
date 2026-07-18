interface ListenerEvent<TListener> {
  addListener(listener: TListener): void;
}

const registeredEvents = new WeakSet<object>();

export function registerListenerOnce<TListener>(
  event: ListenerEvent<TListener>,
  listener: TListener,
): boolean {
  if (registeredEvents.has(event)) return false;
  event.addListener(listener);
  registeredEvents.add(event);
  return true;
}
