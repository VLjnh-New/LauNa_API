'use strict';

/**
 * Tạo VPS Windows tự động qua GitHub Actions.
 *
 *   POST /vps/create
 *   Body JSON: { github_token: 'ghp_...' | 'github_pat_...' }
 *
 * Quy trình:
 *  1. Validate token (gọi /user)
 *  2. Tạo repo public mới `vps-project-<ts>` trong account của user
 *  3. Set repo secret GH_TOKEN = chính token đó
 *  4. Commit 2 workflow file + README
 *  5. Trigger repository_dispatch để workflow Windows chạy
 *  6. Trả về thông tin repo; client poll /vps/users để lấy link noVNC
 *
 * Dựa trên repo: github.com/VLjnh-New/VPS-Github (tác giả: Hiếu Dz)
 */

const { Octokit } = require('@octokit/rest');
const sodium = require('libsodium-wrappers');
const log = require('../../utils/logger');
const { generateTmateYml, generateAutoStartYml } = require('./_workflow');

async function createRepoSecret(octokit, owner, repo, secretName, secretValue) {
    await sodium.ready;
    const { data: { key, key_id } } = await octokit.rest.actions.getRepoPublicKey({ owner, repo });
    const messageBytes = Buffer.from(secretValue);
    const keyBytes = Buffer.from(key, 'base64');
    const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
    const encrypted = Buffer.from(encryptedBytes).toString('base64');
    await octokit.rest.actions.createOrUpdateRepoSecret({
        owner, repo,
        secret_name: secretName,
        encrypted_value: encrypted,
        key_id: key_id.toString()
    });
}

async function createOrUpdateFile(octokit, owner, repo, filePath, content, message) {
    let sha = null;
    try {
        const { data: existing } = await octokit.rest.repos.getContent({ owner, repo, path: filePath });
        sha = existing.sha;
    } catch (e) { if (e.status !== 404) throw e; }
    const params = {
        owner, repo, path: filePath, message,
        content: Buffer.from(content).toString('base64')
    };
    if (sha) params.sha = sha;
    await octokit.rest.repos.createOrUpdateFileContents(params);
}

module.exports = {
    name: '/vps/create',
    methods: {
        post: async (req, res) => {
            const githubToken = String(req.body?.github_token || '').trim();

            if (!githubToken) {
                return res.status(400).json({
                    status: false,
                    message: "Thiếu 'github_token' trong body JSON",
                    example: { github_token: 'ghp_xxxxxxxxxxxxxxxxxxxx' }
                });
            }
            if (!githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_')) {
                return res.status(400).json({
                    status: false,
                    message: "GitHub token phải bắt đầu bằng 'ghp_' hoặc 'github_pat_'"
                });
            }

            try {
                const octokit = new Octokit({ auth: githubToken });
                const { data: user } = await octokit.rest.users.getAuthenticated();
                log.api(`[VPS] Tạo VPS cho ${user.login}`);

                const repoName = `vps-project-${Date.now()}`;
                const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
                    name: repoName,
                    private: false,
                    auto_init: true,
                    description: 'VPS Manager (powered by LauNa-API)'
                });
                const repoFullName = repo.full_name;

                const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                const serverUrl = `${proto}://${req.headers.host}`;

                await new Promise(r => setTimeout(r, 3000));
                await createRepoSecret(octokit, user.login, repoName, 'GH_TOKEN', githubToken);

                const files = [
                    ['.github/workflows/tmate.yml',  generateTmateYml(serverUrl, repoName, repoFullName), 'Add VPS workflow'],
                    ['.github/workflows/auto-start.yml', generateAutoStartYml(repoFullName),              'Add auto-start workflow'],
                    ['README.md', `# ${repoName}\n\nVPS Windows + noVNC tạo bởi LauNa-API.\n\n- Mật khẩu VNC: \`hieudz\`\n- Tự restart sau ~5.5h\n- Link truy cập sẽ ghi vào file \`remote-link.txt\`\n`, 'Update README']
                ];

                for (const [p, content, msg] of files) {
                    try {
                        await createOrUpdateFile(octokit, user.login, repoName, p, content, msg);
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        log.warn(`[VPS] Tạo file ${p} lỗi: ${e.message}`);
                    }
                }

                await new Promise(r => setTimeout(r, 4000));

                try {
                    await octokit.rest.repos.createDispatchEvent({
                        owner: user.login, repo: repoName,
                        event_type: 'create-vps',
                        client_payload: { vps_name: 'initial-vps', created_by: 'launa-api' }
                    });
                } catch (e) {
                    log.warn(`[VPS] Trigger workflow lỗi: ${e.message}`);
                }

                return res.json({
                    status: true,
                    message: 'Đã khởi tạo VPS, workflow đang chạy. Đợi 5-10 phút để có link truy cập.',
                    repository: repoFullName,
                    repository_url: repo.html_url,
                    actions_url: `${repo.html_url}/actions`,
                    workflow_status: 'triggered',
                    estimated_ready: '5-10 phút',
                    vnc_password: 'hieudz',
                    poll: '/vps/users?token=<github_token>',
                    creator: 'Ljzi · based on Hiếu Dz / DuckNoVis'
                });
            } catch (error) {
                log.error(`[VPS] create lỗi: ${error.message}`);
                if (error.status === 401) {
                    return res.status(401).json({
                        status: false,
                        message: 'GitHub token sai hoặc thiếu quyền (cần scope: repo, workflow)',
                        details: error.message
                    });
                }
                if (error.status === 422) {
                    return res.status(422).json({
                        status: false,
                        message: 'GitHub từ chối: ' + (error.message || 'có thể đã trùng tên repo'),
                        details: error.message
                    });
                }
                return res.status(500).json({
                    status: false,
                    message: 'Lỗi khi tạo VPS',
                    details: error.message
                });
            }
        }
    }
};
