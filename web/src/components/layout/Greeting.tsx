export function Greeting({msg}: {msg: string}) {
    return (
        <div className="flex flex-col items-left justify-center gap-2">
            <p className="text-rust text-[12px] font-mono uppercase mb-2 tracking-[.12em]">
                {msg}
            </p>
        </div>
    )
}