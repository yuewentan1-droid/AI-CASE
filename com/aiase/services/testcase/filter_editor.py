"""用例筛选与编辑 - 支持多选、删除、修改"""
import copy


class FilterEditor:
    """对用例列表执行多选/删除/编辑操作，返回新列表"""

    def select(self, cases, indices):
        """按索引多选用例"""
        return [cases[i] for i in indices if 0 <= i < len(cases)]

    def delete(self, cases, indices):
        """按索引删除用例"""
        indices = sorted(set(indices), reverse=True)
        result = list(cases)
        for i in indices:
            if 0 <= i < len(result):
                result.pop(i)
        return result

    def edit(self, cases, index, updates):
        """编辑指定索引用例的字段"""
        result = copy.deepcopy(cases)
        if 0 <= index < len(result):
            result[index].update(updates)
        return result

    def filter_by_module(self, cases, module):
        """按主模块筛选"""
        return [c for c in cases if c.get('主模块') == module]

    def search(self, cases, keyword):
        """按关键字搜索用例"""
        kw = keyword.lower()
        result = []
        for c in cases:
            if any(kw in str(v).lower() for v in c.values()):
                result.append(c)
        return result
