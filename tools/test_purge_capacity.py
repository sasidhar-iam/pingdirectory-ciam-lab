import unittest
from purge_capacity import capacity, daily_deltas

class CapacityTests(unittest.TestCase):
    def model(self, **changes):
        args=dict(backlog=360000,expired_per_second=10,delete_per_second=100,window_hours=2,change_rate=200,change_bytes=600,retention_days=8,overhead_factor=1.5)
        args.update(changes)
        return capacity(**args)
    def test_example(self):
        r=self.model();self.assertEqual(r['drain_seconds'],4000);self.assertEqual(r['estimated_replication_bytes_per_node'],124416000000);self.assertFalse(r['daily_capacity_exceeds_arrivals'])
    def test_unbounded_backlog(self):
        self.assertIsNone(self.model(delete_per_second=10)['drain_seconds'])
    def test_zero_backlog(self):
        self.assertEqual(self.model(backlog=0)['drain_seconds'],0)
    def test_bad_input(self):
        for v in [-1,float('nan'),float('inf')]:
            with self.assertRaises(ValueError):self.model(backlog=v)
        with self.assertRaises(ValueError):self.model(window_hours=25)
    def row(self,day,n,host='pd1'):
        return dict(timestamp_utc=day,host=host,path='/test',allocated_bytes=str(n),apparent_bytes=str(n*2))
    def test_daily_and_gap(self):
        rows=[self.row('2026-01-01T00:00:00Z',10),self.row('2026-01-01T23:00:00Z',20),self.row('2026-01-02T00:00:00Z',25),self.row('2026-01-04T00:00:00Z',30)]
        r=daily_deltas(reversed(rows));self.assertEqual(r[1]['daily_allocated_delta'],5);self.assertIsNone(r[2]['daily_allocated_delta']);self.assertEqual(r[2]['days_since_previous'],2)
    def test_hosts_are_not_combined(self):
        r=daily_deltas([self.row('2026-01-01T00:00:00Z',10),self.row('2026-01-02T00:00:00Z',90,'pd2')]);self.assertTrue(all(x['daily_allocated_delta'] is None for x in r))
    def test_timezone_normalized(self):
        r=daily_deltas([self.row('2026-01-02T01:00:00+11:00',10)]);self.assertEqual(r[0]['day_utc'],'2026-01-01')
    def test_invalid_snapshot(self):
        with self.assertRaises(ValueError):daily_deltas([self.row('2026-01-01',1)])

if __name__=='__main__':unittest.main()
