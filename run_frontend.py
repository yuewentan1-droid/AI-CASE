"""前端入口：通过 Vite 启动开发服务器，端口 8080（/api 代理到后端 5050）"""
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')


if __name__ == '__main__':
    cmd = ['npm', 'run', 'dev']
    if sys.platform == 'win32':
        cmd = ['npm.cmd', 'run', 'dev']
    subprocess.run(cmd, cwd=ROOT, check=True)
