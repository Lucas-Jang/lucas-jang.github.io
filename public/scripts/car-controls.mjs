export const BOOST_CHARGE_MS = 1000;

export function isCarHome(url) {
  const category = new URL(url.href).searchParams.get('category');
  return url.pathname === '/' && (!category || category === 'ALL');
}

export function chargedBoost(milliseconds = 0) {
  const charge = Math.max(0, Math.min(1, milliseconds / BOOST_CHARGE_MS));
  return { charge, power: .3 + .7 * charge, duration: .65 + 1.1 * charge, full: charge === 1 };
}

export function shouldRamp(profile, elapsed, crossedCorner) {
  return profile?.full === true && elapsed >= 1 && crossedCorner;
}
