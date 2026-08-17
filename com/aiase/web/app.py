"""后端 Flask 应用 - 仅提供 JSON API，前端独立部署"""
import os

from flask import Flask
from flask_cors import CORS

from com.aiase.web.routes.upload_routes import bp as upload_bp
from com.aiase.web.routes.analysis_routes import bp as analysis_bp
from com.aiase.web.routes.testcase_routes import bp as testcase_bp
from com.aiase.web.routes.export_routes import bp as export_bp
from com.aiase.web.routes.skill_routes import bp as skill_bp


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
    app.config['SECRET_KEY'] = os.urandom(16).hex()
    # expose_headers：导出响应通过 X-Filename 头返回 AI 生成的文件名，供前端读取
    CORS(app, expose_headers=['X-Filename'])
    app.register_blueprint(upload_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(testcase_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(skill_bp)
    return app


app = create_app()
