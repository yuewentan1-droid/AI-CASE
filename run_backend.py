"""后端入口：Flask JSON API，端口 5050"""
from com.aiase.web.app import app

if __name__ == '__main__':
    # threaded=True：允许在长分析/生成进行中处理「停止」请求，实现立即停止
    app.run(host='0.0.0.0', port=5050, debug=True, threaded=True)
