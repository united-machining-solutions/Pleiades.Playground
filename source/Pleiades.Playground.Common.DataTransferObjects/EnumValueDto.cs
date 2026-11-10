using System;

namespace Pleiades.Playground.Common.DataTransferObjects;

public record class EnumValueDto<T> : StringValueDto where T : Enum
{
    public new T Value { get; set; }
}
