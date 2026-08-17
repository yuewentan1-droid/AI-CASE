"""优先级计算 - 结合风险等级与影响等级打分排序"""

_LEVEL_SCORE = {'高': 3, '中': 2, '低': 1}


class PriorityCalculator:

    @staticmethod
    def score(item):
        """综合风险与影响计算优先级分数"""
        risk = _LEVEL_SCORE.get(item.get('level', '低'), 1)
        impact = _LEVEL_SCORE.get(item.get('impact', '低'), 1)
        return risk * 2 + impact

    def prioritize(self, risks, impact_areas):
        """对影响面按优先级排序，同时关联风险"""
        items = []
        for area in impact_areas:
            area['priority_score'] = self.score(area)
            items.append(area)
        items.sort(key=lambda x: x['priority_score'], reverse=True)
        return items

    def risk_priorities(self, risks):
        """对风险点排序"""
        sorted_risks = sorted(risks, key=lambda r: _LEVEL_SCORE.get(r.get('level', '低'), 1), reverse=True)
        return sorted_risks
