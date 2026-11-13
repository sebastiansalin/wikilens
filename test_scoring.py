import unittest
from datetime import datetime, timedelta
from scoring import detect_reverts, score_window, smooth_score


class ScoringTests(unittest.TestCase):
    def rows(self, values):
        return [dict(rev_id=i+1,user=u,sha1=h,timestamp=datetime(2020,1,1)+timedelta(minutes=i))
                for i,(u,h) in enumerate(values)]

    def test_restoration_and_mutuality(self):
        rows=self.rows([('A','x'),('B','y'),('A','x'),('B','y')])
        events=detect_reverts(rows)
        self.assertEqual([(e['actor'],e['target']) for e in events],[('A','B'),('B','A')])
        self.assertEqual(events[0]['restored_rev_id'],1)
        result=score_window(rows,events,rows[0]['timestamp'],rows[-1]['timestamp'])
        self.assertEqual(result['mutual'],2)
        self.assertEqual(result['historicalVolume'],8)

    def test_no_self_or_null_hash_reverts(self):
        rows=self.rows([('A','x'),('A','y'),('A','x'),('B',None),('C',None)])
        self.assertEqual(detect_reverts(rows),[])

    def test_no_future_mutuality(self):
        rows=self.rows([('A','x'),('B','y'),('A','x'),('B','y')])
        early=score_window(rows,detect_reverts(rows),rows[0]['timestamp'],rows[2]['timestamp'])
        self.assertEqual(early['mutual'],0)

    def test_smoothing(self):
        self.assertAlmostEqual(smooth_score(0,0,.05),5)
        self.assertLess(smooth_score(1,2,.05),50)
        self.assertGreater(smooth_score(20,100,.05),smooth_score(0,100,.05))


if __name__=='__main__':
    unittest.main()
