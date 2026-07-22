import sitesData from '../../data/sites.json';
import templateData from '../../data/tag-templates.json';
import type { Tag, NodeClass } from '../types';

const sites = sitesData as import('../types').Site[];
const templates = templateData as Record<string, Array<Record<string, unknown>>>;

function classKey(cls: NodeClass): string {
  return cls;
}

export function generateTags(): Record<string, Tag> {
  const tags: Record<string, Tag> = {};

  for (const site of sites) {
    const cls = site.class as NodeClass;
    const tmplKey = classKey(cls);
    const tmpl = templates[tmplKey];
    if (!tmpl) continue;

    // Determine pump counts from phase1 data
    const pumpsWorking = (site.phase1?.pumps_working as number) ?? 2;
    const pumpsStandby = (site.phase1?.pumps_standby as number) ?? 1;
    const totalPumps = pumpsWorking + pumpsStandby;
    const filterCount = cls === 'WTP' ? 12 : 0;

    for (const tpl of tmpl) {
      const suffix = tpl.suffix as string;

      if (tpl.per_pump) {
        const n = Math.min(totalPumps, 12);
        for (let i = 1; i <= n; i++) {
          const s = suffix.replace('{n}', String(i));
          const tag_id = `${site.id}-${s}`;
          tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, s);
        }
      } else if (tpl.per_filter) {
        for (let i = 1; i <= filterCount; i++) {
          const s = suffix.replace('{n}', String(i));
          const tag_id = `${site.id}-${s}`;
          tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, s);
        }
      } else {
        const tag_id = `${site.id}-${suffix}`;
        tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, suffix);
      }
    }

    // WTP has a clear-water pumping station (CWPS): add the IBPS pump-set tags
    if (cls === 'WTP') {
      const ibpsTmpl = templates['IBPS'];
      if (ibpsTmpl) {
        for (const tpl of ibpsTmpl) {
          const suffix = tpl.suffix as string;
          if (tpl.per_pump) {
            const n = Math.min(totalPumps, 12);
            for (let i = 1; i <= n; i++) {
              const s = suffix.replace('{n}', String(i));
              const tag_id = `${site.id}-${s}`;
              if (!tags[tag_id]) tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, s);
            }
          } else if (suffix === 'PT-SUCT' || suffix === 'PT-DELY') {
            const tag_id = `${site.id}-${suffix}`;
            if (!tags[tag_id]) tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, suffix);
          }
        }
      }
    }

    // For OFFTAKE_PUMPED, also add IBPS tags
    if (cls === 'OFFTAKE_PUMPED') {
      const ibpsTmpl = templates['IBPS'];
      if (ibpsTmpl) {
        for (const tpl of ibpsTmpl) {
          const suffix = tpl.suffix as string;
          if (tpl.per_pump) {
            const n = Math.min(totalPumps, 5);
            for (let i = 1; i <= n; i++) {
              const s = 'IBPS-' + suffix.replace('{n}', String(i));
              const tag_id = `${site.id}-${s}`;
              if (!tags[tag_id]) {
                tags[tag_id] = makeTag(tag_id, site.id, cls, tpl, s);
              }
            }
          }
        }
      }
    }
  }

  return tags;
}

function makeTag(tag_id: string, site_id: string, cls: NodeClass, tpl: Record<string, unknown>, _suffix: string): Tag {
  const range = tpl.range as [number, number];
  const midVal = (range[0] + range[1]) / 2;

  return {
    tag_id,
    site_id,
    node_class: cls,
    measurement: tpl.measurement as string,
    description: tpl.description as string,
    unit: tpl.unit as string,
    signal: tpl.signal as string,
    range,
    alarm_low_low: tpl.alarm_low_low as number | undefined,
    alarm_low: tpl.alarm_low as number | undefined,
    alarm_high: tpl.alarm_high as number | undefined,
    alarm_high_high: tpl.alarm_high_high as number | undefined,
    poll_interval_s: 5,
    phase: 'both',
    value: midVal,
    alarm_state: 'normal',
    timestamp: Date.now(),
    history: [],
  };
}

export const ALL_TAGS = generateTags();
export const ALL_SITES = sites;
