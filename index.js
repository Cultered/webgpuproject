async function loadShaderModuleFromFile(device, url) {
    const code = await fetch(url).then(r => r.text());
    return device.createShaderModule({ code });
}
async function getContext() {
    if (!navigator.gpu) {
        console.error("WebGPU API unavailable");
        return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No adapter found");
    }
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: format,
        alphaMode: 'premultiplied',
    });
    return [adapter, device, canvas, context, format];
}
async function initWebGPU() {

    try {
        const c = [1.0, 0.0, 1.0, 1.0]; // Example color (red, fully opaque)
        const width = window.innerWidth;
        const height = window.innerHeight;
        const verticesArray = [];
        const latitudeBands = 10;
        const longitudeBands = 10;
        const radius = 1;
        // Generate sphere vertices (triangle list)
        for (let lat = 0; lat < latitudeBands; lat++) {
            const theta1 = (lat / latitudeBands) * Math.PI;
            const theta2 = ((lat + 1) / latitudeBands) * Math.PI;

            for (let lon = 0; lon < longitudeBands; lon++) {
            const phi1 = (lon / longitudeBands) * 2 * Math.PI;
            const phi2 = ((lon + 1) / longitudeBands) * 2 * Math.PI;

            // Four points of the quad
            const p1 = [
                radius * Math.sin(theta1) * Math.cos(phi1),
                radius * Math.cos(theta1),
                radius * Math.sin(theta1) * Math.sin(phi1),
                1
            ];
            const p2 = [
                radius * Math.sin(theta2) * Math.cos(phi1),
                radius * Math.cos(theta2),
                radius * Math.sin(theta2) * Math.sin(phi1),
                1
            ];
            const p3 = [
                radius * Math.sin(theta2) * Math.cos(phi2),
                radius * Math.cos(theta2),
                radius * Math.sin(theta2) * Math.sin(phi2),
                1
            ];
            const p4 = [
                radius * Math.sin(theta1) * Math.cos(phi2),
                radius * Math.cos(theta1),
                radius * Math.sin(theta1) * Math.sin(phi2),
                1
            ];

            // Assign a unique color per quad based on lat/lon
            const color1 = [
                lat / latitudeBands,
                lon / longitudeBands,
                1.0 - lat / latitudeBands,
                1
            ];
            const color2 = [
                (lat + 1) / latitudeBands,
                (lon +1) / longitudeBands,
                1.0 - (lat + 1) / latitudeBands,
                1
            ];

            // First triangle
            verticesArray.push(...p1, ...color1);
            verticesArray.push(...p2, ...color2);
            verticesArray.push(...p3, ...color1);

            // Second triangle
            verticesArray.push(...p1, ...color1);
            verticesArray.push(...p3, ...color1);
            verticesArray.push(...p4, ...color2);
            }
        }
        const vertices = new Float32Array(verticesArray);
        const [adapter, device, canvas, context, format] = await getContext()
        canvas.width = window.innerWidth-1
        canvas.height = window.innerHeight-1
        const shaderModule = await loadShaderModuleFromFile(device, './shader.wgsl');
        const vertexBuffer = device.createBuffer({
            size: vertices.byteLength, // make it big enough to store vertices in
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const uniformBuffer = device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const uniformData = new Float32Array([
            canvas.width,
            canvas.height
        ]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);
        const vertexBuffers = [
            {
                attributes: [
                    {
                        shaderLocation: 0, // position
                        offset: 0,
                        format: "float32x4",
                    },
                    {
                        shaderLocation: 1, // color
                        offset: 16,
                        format: "float32x4",
                    },
                ],
                arrayStride: 32,
                stepMode: "vertex",
            },
        ];
        const bindGroupLayout = device.createBindGroupLayout({
            entries: [{
                binding: 0,  // Must match @binding(0) in WGSL
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform'
                }
            }]
        });
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: uniformBuffer }
            }]
        });


        const pipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: "vertex_main",
                buffers: vertexBuffers,
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fragment_main",
                targets: [
                    {
                        format: navigator.gpu.getPreferredCanvasFormat(),
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
            },

            layout: device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            }),
            multisample: {
                count: 4, // 4x MSAA
            },
        };
        const renderPipeline = device.createRenderPipeline(pipelineDescriptor);


        const commandEncoder = device.createCommandEncoder();
        const clearColor = { r: 1, g: 1, b: 1, a: 1.0 };
        const sampleCount = 4;
        const msaaTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            sampleCount,
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const renderPassDescriptor = {
            colorAttachments: [{
                view: msaaTexture.createView(),
                resolveTarget: context.getCurrentTexture().createView(),
                clearValue: clearColor,
                loadOp: "clear",
                storeOp: "store",
            }],
        };


        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(renderPipeline);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setBindGroup(0, bindGroup);

        passEncoder.draw(vertices.length / 8);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

    } catch (error) {
        console.error("WebGPU initialization failed:", error);
        document.getElementById('webgpu-instructions').style.display = 'block';
    }
}
initWebGPU()