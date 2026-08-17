"""分析报告构建 - 汇总阶段一所有结果"""
from com.aiase.services.analysis.risk_analyzer import RiskAnalyzer
from com.aiase.services.analysis.impact_analyzer import ImpactAnalyzer
from com.aiase.services.analysis.priority_calculator import PriorityCalculator
from com.aiase.services.analysis.summary_generator import SummaryGenerator


class ReportBuilder:
    """构建阶段一完整分析报告"""

    def __init__(self, ai_processor):
        self.risk_analyzer = RiskAnalyzer(ai_processor)
        self.impact_analyzer = ImpactAnalyzer(ai_processor)
        self.priority_calculator = PriorityCalculator()
        self.summary_generator = SummaryGenerator(ai_processor)

    def build(self, parsed_data):
        risks = self.risk_analyzer.analyze(parsed_data)
        impact = self.impact_analyzer.analyze(parsed_data)
        prioritized = self.priority_calculator.prioritize(risks, impact.get('impact_areas', []))
        risk_priorities = self.priority_calculator.risk_priorities(risks)
        summary = self.summary_generator.generate(risks, impact, prioritized)
        return {
            'risks': risk_priorities,
            'impact_areas': prioritized,
            'new_features': impact.get('new_features', []),
            'existing_features': impact.get('existing_features', []),
            'summary': summary,
        }
